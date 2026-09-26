<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { isolateHistory, redo, undo } from "@codemirror/commands";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { message } from "@tauri-apps/plugin-dialog";
  import { createState, documentText } from "$lib/editor/setup";
  import { exportHtml } from "$lib/export/html";
  import {
    type ExportFormat,
    baseName,
    cancelQuit,
    createDocument,
    exportPdf,
    fileName,
    moveDocument,
    pickExportTarget,
    pickFileToOpen,
    openDocument,
    pickSaveLocation,
    printPage,
    setDocumentEdited,
    setDocumentPath,
    setFileTags,
    showDocumentInfo,
    takeInitialDocument,
    writeDocument,
  } from "$lib/files";
  import { applyPlatform, type OS } from "$lib/platform";
  import { noteRecentDocument, setPreviewChecked } from "$lib/menu";
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
  let renaming = $state(false);
  let titleBar = $state<TitleBar>();

  let host: HTMLElement;
  let view: EditorView;

  const appWindow = getCurrentWebviewWindow();
  const name = $derived(fileName(path));

  $effect(() => {
    const title =
      os === "windows" ? `${dirty ? "*" : ""}${name} - Writer` : `${name}${dirty ? " — Edited" : ""}`;
    appWindow.setTitle(title);
  });

  $effect(() => {
    setDocumentEdited(dirty);
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
      previewHtml = renderMarkdown(documentText(view), { preview: true });
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

  /** Ticks or unticks the task list item on 0-based source `line`; false if it isn't one. */
  function toggleTask(line: number): boolean {
    if (line >= view.state.doc.lines) return false;
    const { from, text } = view.state.doc.line(line + 1);
    // Optional blockquote marks, a list marker, then the box.
    const match = /^(?:\s*>)*\s*(?:[-*+]|\d{1,9}[.)])\s+\[([ xX])\]/.exec(text);
    if (!match) return false;
    const at = from + match[0].length - 2;
    view.dispatch({
      changes: { from: at, to: at + 1, insert: match[1] === " " ? "x" : " " },
      // Each tick is its own undo step.
      annotations: isolateHistory.of("full"),
    });
    return true;
  }

  /** Undo/redo also work in preview, which is re-rendered to show the result. */
  function runHistory(command: typeof undo) {
    if (command(view) && previewing) {
      previewHtml = renderMarkdown(documentText(view), { preview: true });
    }
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
    if (target !== path) {
      noteRecentDocument(target);
      setDocumentPath(target);
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

  /**
   * macOS: the title popover renames, moves and tags the file, keeping unsaved
   * edits, as NSDocument apps do. An untitled document is saved there instead.
   */
  async function rename() {
    if (os !== "mac" || !titleBar) return;
    renaming = true;
    let info;
    try {
      info = await showDocumentInfo(titleBar.anchor(), path);
    } finally {
      renaming = false;
    }
    if (!previewing) view.focus();
    if (!info) return;
    const target = `${info.directory.replace(/\/$/, "")}/${info.name}`;
    try {
      if (!path) {
        const text = documentText(view);
        await createDocument(target, text);
        noteRecentDocument(target);
        setDocumentPath(target);
        savedText = text;
        dirty = documentText(view) !== savedText;
      } else if (target !== path) {
        // Rust updates this window's path and Open Recent.
        await moveDocument(path, target);
      }
      path = target;
      if (info.tags) await setFileTags(target, info.tags);
    } catch (err) {
      await showError(err);
    }
  }

  /** Returns true when it is safe to close the document. */
  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true;
    // Quit may be closing a window in the background; show which one is asking.
    await appWindow.unminimize();
    await appWindow.setFocus();
    const choice = await message(`Do you want to save the changes you made to “${name}”?`, {
      title: "Unsaved changes",
      kind: "warning",
      buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
    });
    if (choice === "Save" || choice === "Yes") return save();
    return choice === "Don't Save" || choice === "No";
  }

  async function openFile() {
    const target = await pickFileToOpen();
    if (target) await open(target);
  }

  /** Opens `target` here if this window is an untouched untitled document, else elsewhere. */
  async function open(target: string) {
    const reuse = !path && !dirty && view.state.doc.length === 0;
    try {
      const text = await openDocument(target, reuse);
      if (text !== null) load(text, target);
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
    open: openFile,
    save,
    save_as: saveAs,
    rename,
    export: exportDocument,
    print,
    // onCloseRequested handles unsaved changes. New and Quit are handled in Rust.
    close: () => appWindow.close(),
    undo: () => runHistory(undo),
    redo: () => runHistory(redo),
    preview: togglePreview,
  };

  /** Runs a file command unless another one is still in progress. */
  async function exclusive(action: (() => unknown) | undefined) {
    if (busy || !action) return;
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }

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
      // Rust sends menu commands to the focused window only.
      appWindow.listen<string>("menu", ({ payload }) => {
        // Editing commands must stay responsive; file commands shouldn't overlap.
        if (payload === "undo" || payload === "redo" || payload === "preview") {
          return actions[payload]();
        }
        return exclusive(actions[payload]);
      }),
      appWindow.listen<string>("open-recent", ({ payload }) => exclusive(() => open(payload))),
      // A file opened from Finder/Explorer, sent here because this window is untouched.
      appWindow.listen<{ path: string; text: string }>("load-document", ({ payload }) =>
        load(payload.text, payload.path),
      ),
      appWindow.onCloseRequested(async (event) => {
        if (await confirmDiscard()) return;
        event.preventDefault();
        cancelQuit();
      }),
      // The Preview checkmark is app-wide; restate this window's state when it comes forward.
      appWindow.onFocusChanged(({ payload: focused }) => {
        if (focused) setPreviewChecked(previewing);
      }),
    ];
    // Only once listening: after this, Rust sends documents as `load-document` events.
    Promise.all(unlisten)
      .then(() => takeInitialDocument())
      .then((doc) => doc && load(doc.text, doc.path));

    return () => {
      document.removeEventListener("contextmenu", blockChromeMenu);
      unlisten.forEach((p) => p.then((fn) => fn()));
      view.destroy();
    };
  });
</script>

<div class="app-root flex h-full flex-col bg-surface">
  <TitleBar
    bind:this={titleBar}
    {os}
    {name}
    {dirty}
    {previewing}
    {renaming}
    onTogglePreview={togglePreview}
    onRename={() => exclusive(rename)}
  />
  <main class="min-h-0 flex-1" class:hidden={previewing} bind:this={host}></main>
  {#if previewing}
    <div class="min-h-0 flex-1">
      <Preview
        bind:this={preview}
        html={previewHtml}
        line={previewLine}
        onexit={togglePreview}
        ontoggletask={toggleTask}
      />
    </div>
  {/if}
</div>

<div class="print-root" aria-hidden="true">
  <article class="preview">{@html printHtml}</article>
</div>
