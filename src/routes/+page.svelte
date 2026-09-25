<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { redo, undo } from "@codemirror/commands";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { message } from "@tauri-apps/plugin-dialog";
  import { createState, documentText } from "$lib/editor/setup";
  import {
    fileName,
    pickFileToOpen,
    pickSaveLocation,
    readDocument,
    writeDocument,
  } from "$lib/files";
  import { applyPlatform, type OS } from "$lib/platform";

  let os = $state<OS>("mac");
  let path = $state<string | null>(null);
  let dirty = $state(false);
  let savedText = "";
  let busy = false;

  let host: HTMLElement;
  let view: EditorView;

  const appWindow = getCurrentWindow();
  const name = $derived(fileName(path));

  $effect(() => {
    const title =
      os === "windows" ? `${dirty ? "*" : ""}${name} - Writer` : `${name}${dirty ? " — Edited" : ""}`;
    appWindow.setTitle(title);
  });

  function onChange(v: EditorView) {
    dirty = documentText(v) !== savedText;
  }

  function load(text: string, newPath: string | null) {
    view.setState(createState(text, onChange));
    savedText = text;
    path = newPath;
    dirty = false;
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

  const actions: Record<string, () => unknown> = {
    new: newDocument,
    open: openDocument,
    save,
    save_as: saveAs,
    // Closing the only window quits the app; onCloseRequested handles unsaved changes.
    close: () => appWindow.close(),
    quit: () => appWindow.close(),
    undo: () => undo(view),
    redo: () => redo(view),
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
        if (payload === "undo" || payload === "redo") return actions[payload]();
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

<div class="flex h-full flex-col bg-surface">
  {#if os === "mac"}
    <header
      class="chrome font-ui text-muted flex shrink-0 items-center justify-center"
      style="height: var(--titlebar-height); font-size: var(--ui-size)"
      data-tauri-drag-region
    >
      <span class="pointer-events-none truncate px-20">
        {name}{#if dirty}<span class="opacity-70"> — Edited</span>{/if}
      </span>
    </header>
  {/if}
  <main class="min-h-0 flex-1" bind:this={host}></main>
</div>
