<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { redo, undo } from "@codemirror/commands";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { message } from "@tauri-apps/plugin-dialog";
  import { createState, documentText } from "$lib/editor/setup";
  import { exportHtml } from "$lib/export/html";
  import {
    type ExportFormat,
    baseName,
    exportPdf,
    fileName,
    pickExportTarget,
    pickFileToOpen,
    pickSaveLocation,
    printPage,
    readDocument,
    writeDocument,
  } from "$lib/files";
  import { applyPlatform, type OS } from "$lib/platform";
  import { setPreviewChecked } from "$lib/menu";
  import Preview from "$lib/preview/Preview.svelte";
  import TitleBar from "$lib/ui/TitleBar.svelte";
  import { renderMarkdown } from "$lib/preview/render";

  let os = $state<OS>("mac");
  let path = $state<string | null>(null);
  let dirty = $state(false);
  let savedText = "";
  let busy = false;

  let previewing = $state(false);
  let previewHtml = $state("");
  let previewLine = $state(0);
  let preview = $state<Preview>();
  let printHtml = $state("");
  let exportFormat: ExportFormat = "html";

  let host: HTMLElement;
  let view: EditorView;

  const appWindow = getCurrentWindow();
  const name = $derived(fileName(path));

  $effect(() => {
    const title =
      os === "windows" ? `${dirty ? "*" : ""}${name} - Writer` : `${name}${dirty ? " — Edited" : ""}`;
    appWindow.setTitle(title);
  });

  // The native menu toggles its own checkmark on click; always restate ours.
  $effect(() => {
    setPreviewChecked(previewing);
  });

  function onChange(v: EditorView) {
    dirty = documentText(v) !== savedText;
  }

  function load(text: string, newPath: string | null) {
    view.setState(createState(text, onChange));
    savedText = text;
    path = newPath;
    dirty = false;
    previewing = false;
    view.focus();
  }

  /** Swaps between editor and rendered preview, keeping the reading position. */
  function togglePreview() {
    if (!previewing) {
      const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      previewLine = view.state.doc.lineAt(top.from).number - 1;
      previewHtml = renderMarkdown(documentText(view), { sourceLines: true });
      previewing = true;
      return;
    }
    const line = Math.min((preview?.topLine() ?? 0) + 1, view.state.doc.lines);
    previewing = false;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "start" }),
    });
    view.focus();
  }

  async function showError(err: unknown) {
    await message(String(err), { title: "Writer", kind: "error" });
  }

  async function write(target: string): Promise<boolean> {
    const text = documentText(view);
    try {
      await writeDocument(target, text);
    } catch (err) {
      await showError(err);
      return false;
    }
    path = target;
    savedText = text;
    dirty = documentText(view) !== savedText;
    return true;
  }

  async function saveAs(): Promise<boolean> {
    const target = await pickSaveLocation(path ?? "Untitled.md");
    return target ? write(target) : false;
  }

  function save(): Promise<boolean> {
    return path ? write(path) : saveAs();
  }

  /** Returns true when it is safe to replace or close the current document. */
  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true;
    const choice = await message(`Do you want to save the changes you made to “${name}”?`, {
      title: "Unsaved changes",
      kind: "warning",
      buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
    });
    if (choice === "Save" || choice === "Yes") return save();
    return choice === "Don't Save" || choice === "No";
  }

  async function newDocument() {
    if (await confirmDiscard()) load("", null);
  }

  async function openDocument() {
    if (!(await confirmDiscard())) return;
    const target = await pickFileToOpen();
    if (!target) return;
    try {
      load(await readDocument(target), target);
    } catch (err) {
      await showError(err);
    }
  }

  async function exportDocument() {
    const target = await pickExportTarget(path, exportFormat);
    if (!target) return;
    exportFormat = target.format;
    const text = documentText(view);
    try {
      if (target.format === "pdf") {
        // The PDF is printed from the page, so render the print copy first.
        printHtml = renderMarkdown(text);
        await tick();
        await exportPdf(target.path);
      } else {
        await writeDocument(target.path, await exportHtml(text, baseName(path)));
      }
    } catch (err) {
      await showError(err);
    }
  }

  async function print() {
    printHtml = renderMarkdown(documentText(view));
    await tick();
    try {
      await printPage();
    } catch (err) {
      await showError(err);
    }
  }

  const actions: Record<string, () => unknown> = {
    new: newDocument,
    open: openDocument,
    save,
    save_as: saveAs,
    export: exportDocument,
    print,
    // Closing the only window quits the app; onCloseRequested handles unsaved changes.
    close: () => appWindow.close(),
    quit: () => appWindow.close(),
    undo: () => previewing || undo(view),
    redo: () => previewing || redo(view),
    preview: togglePreview,
  };

  onMount(() => {
    os = applyPlatform();
    view = new EditorView({ state: createState("", onChange), parent: host });
    view.focus();

    // App chrome has no web context menu, like native UI.
    const blockChromeMenu = (e: MouseEvent) => {
      if ((e.target as Element).closest(".chrome")) e.preventDefault();
    };
    document.addEventListener("contextmenu", blockChromeMenu);

    const unlisten = [
      listen<string>("menu", async ({ payload }) => {
        // Editing commands must stay responsive; file commands shouldn't overlap.
        if (payload === "undo" || payload === "redo" || payload === "preview") {
          return actions[payload]();
        }
        if (busy) return;
        busy = true;
        try {
          await actions[payload]?.();
        } finally {
          busy = false;
        }
      }),
      appWindow.onCloseRequested(async (event) => {
        if (!(await confirmDiscard())) event.preventDefault();
      }),
    ];

    return () => {
      document.removeEventListener("contextmenu", blockChromeMenu);
      unlisten.forEach((p) => p.then((fn) => fn()));
      view.destroy();
    };
  });
</script>

<div class="app-root flex h-full flex-col bg-surface">
  <TitleBar {os} {name} {dirty} {previewing} onTogglePreview={togglePreview} />
  <main class="min-h-0 flex-1" class:hidden={previewing} bind:this={host}></main>
  {#if previewing}
    <div class="min-h-0 flex-1">
      <Preview bind:this={preview} html={previewHtml} line={previewLine} onexit={togglePreview} />
    </div>
  {/if}
</div>

<div class="print-root" aria-hidden="true">
  <article class="preview">{@html printHtml}</article>
</div>
