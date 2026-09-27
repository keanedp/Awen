<script lang="ts">
  import { onMount, tick } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { isolateHistory, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
  import { findNext, findPrevious } from "@codemirror/search";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import { message } from "@tauri-apps/plugin-dialog";
  import { findSelection, openFind } from "$lib/editor/find";
  import { countWords, formatCount } from "$lib/editor/count";
  import { setCodeHighlighting } from "$lib/editor/code";
  import { createState, documentText, setReadOnly, setSpellcheck } from "$lib/editor/setup";
  import { systemSpellChecker } from "$lib/spellchecker";
  import { taskToggle } from "$lib/editor/tasks";
  import { formatCommands } from "$lib/editor/format";
  import { exportHtml } from "$lib/export/html";
  import {
    baseName,
    cancelQuit,
    createDocument,
    dirName,
    duplicateDocument,
    exportPdf,
    fileName,
    isFileLocked,
    moveDocument,
    pickExportTarget,
    pickFileToOpen,
    openDocument,
    pickSaveLocation,
    printPage,
    setDocumentEdited,
    setDocumentPath,
    setFileLocked,
    setFileTags,
    showDocumentInfo,
    takeInitialDocument,
    writeDocument,
  } from "$lib/files";
  import { applyAccent, applyPlatform, type OS } from "$lib/platform";
  import { noteRecentDocument, setFormatEnabled, setMenuChecked } from "$lib/menu";
  import {
    defaults,
    loadPreferences,
    onPreferenceChanged,
    setPreference,
    setPreferences,
    type Preferences,
  } from "$lib/preferences";
  import { viewChange, writingStyle } from "$lib/settings";
  import Preview from "$lib/preview/Preview.svelte";
  import TitleBar from "$lib/ui/TitleBar.svelte";
  import WordCount from "$lib/ui/WordCount.svelte";
  import { loadCodeLanguages } from "$lib/preview/highlight";
  import { renderMarkdown } from "$lib/preview/render";
  import { fitTables } from "$lib/preview/fit-tables";
  import { prefersReducedMotion, previewFade } from "$lib/preview/transition";

  let os = $state<OS>("mac");
  let path = $state<string | null>(null);
  let dirty = $state(false);
  /** The file is locked (macOS), so the editor is read-only. */
  let locked = $state(false);
  let savedText = "";
  let busy = false;

  let previewing = $state(false);
  let previewHtml = $state("");
  let previewLine = $state(0);
  let preview = $state<Preview>();
  /** Preview has finished fading in over the editor, which can then stop painting. */
  let covered = $state(false);
  let printHtml = $state("");
  let printArticle: HTMLElement;
  let prefs = $state<Preferences>({ ...defaults });
  /** Until then `prefs` holds defaults, so a hidden footer would flash up in a new window. */
  let prefsLoaded = $state(false);
  /** Words in the document, and in the selection if there is one. */
  let words = $state(0);
  let selectedWords = $state<number | null>(null);
  let renaming = $state(false);
  let titleBar = $state<TitleBar>();

  let host: HTMLElement;
  let view: EditorView;

  const appWindow = getCurrentWebviewWindow();
  const name = $derived(fileName(path));

  /**
   * Renders the document for this webview, with images beside the file loadable.
   * Code is highlighted in languages already loaded; await `codeLanguages()` first.
   */
  function render({ preview = false } = {}): string {
    return renderMarkdown(documentText(view), { preview, folder: path && dirName(path) });
  }

  /** Loads the parsers for the languages the document's code blocks name. */
  function codeLanguages(): Promise<void> {
    return loadCodeLanguages(documentText(view));
  }

  /**
   * Waits for the print copy's images, so print and PDF don't catch them half-loaded,
   * then fits wide tables to the page (their width depends on the images).
   */
  async function printCopyReady() {
    await tick();
    const images = document.querySelectorAll<HTMLImageElement>(".print-root img");
    await Promise.all([...images].map((img) => img.decode().catch(() => {})));
    fitTables(printArticle);
  }

  $effect(() => {
    const title =
      os === "windows"
        ? `${dirty ? "*" : ""}${name} - Awen`
        : `${name}${locked ? " — Locked" : dirty ? " — Edited" : ""}`;
    appWindow.setTitle(title);
  });

  $effect(() => {
    setDocumentEdited(dirty);
  });

  // The native menu toggles its own checkmark on click; always restate ours.
  $effect(() => {
    setMenuChecked("preview", previewing);
  });
  $effect(() => {
    setMenuChecked("word_count", prefs.wordCount);
  });
  $effect(() => {
    setMenuChecked("code_highlighting", prefs.codeHighlighting);
  });
  // Formatting only applies in the editor, to a document that can be changed.
  $effect(() => {
    setFormatEnabled(!previewing && !locked);
  });

  // The editor exists once mounted; before that, `newState` takes the setting.
  $effect(() => {
    const on = prefs.codeHighlighting;
    if (view) setCodeHighlighting(view, on);
  });
  $effect(() => {
    const on = prefs.spellcheck;
    if (view) setSpellcheck(view, on);
  });

  function onChange(v: EditorView) {
    dirty = documentText(v) !== savedText;
  }

  let countTimer: ReturnType<typeof setTimeout> | undefined;
  /** The text the document count was taken from; a selection change alone doesn't recount it. */
  let countedDoc: unknown = null;

  /** Recounts shortly after typing or selecting stops; only while the count is shown. */
  function scheduleCount() {
    clearTimeout(countTimer);
    if (!prefs.wordCount) return;
    countTimer = setTimeout(() => {
      const { state } = view;
      if (state.doc !== countedDoc) {
        words = countWords(state);
        countedDoc = state.doc;
      }
      const ranges = state.selection.ranges.filter((r) => !r.empty);
      selectedWords = ranges.length ? countWords(state, ranges) : null;
    }, 150);
  }

  // Showing the count again catches up with edits made while it was hidden.
  $effect(() => {
    if (prefs.wordCount) scheduleCount();
  });

  function newState(text: string) {
    return createState(text, onChange, () => exclusive(askToUnlock), scheduleCount, {
      highlightCode: prefs.codeHighlighting,
      spellcheck: prefs.spellcheck,
      checker: systemSpellChecker,
    });
  }

  /** Shows `text` from `newPath`, or as an unsaved untitled copy if there is no path. */
  function load(text: string, newPath: string | null) {
    view.setState(newState(text));
    savedText = newPath ? text : "";
    path = newPath;
    dirty = text !== savedText;
    previewing = false;
    view.focus();
    refreshLocked();
    scheduleCount();
  }

  /** Reads the file's locked flag, which Finder can change at any time. */
  async function refreshLocked() {
    const target = path;
    const now = target !== null && (await isFileLocked(target));
    if (target !== path) return;
    locked = now;
    setReadOnly(view, now);
  }

  /** An edit to a locked document offers to unlock it or edit a copy, as TextEdit does. */
  async function askToUnlock() {
    if (!locked || !path) return;
    const choice = await message("You can duplicate it and edit the copy, or unlock it and edit it here.", {
      title: `The document “${name}” is locked.`,
      kind: "info",
      buttons: { yes: "Duplicate", no: "Unlock", cancel: "Cancel" },
    });
    try {
      if (choice === "Duplicate" || choice === "Yes") {
        await duplicateDocument(documentText(view));
        return;
      }
      if (choice === "Unlock" || choice === "No") {
        await setFileLocked(path, false);
        await refreshLocked();
      }
    } catch (err) {
      await showError(err);
    }
    if (!previewing) view.focus();
  }

  /** Swaps between editor and rendered preview, keeping the reading position. */
  async function togglePreview() {
    if (!previewing) {
      // Usually instant: parsers are cached after the first load.
      await codeLanguages();
      if (previewing) return;
      const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      previewLine = view.state.doc.lineAt(top.from).number - 1;
      previewHtml = render({ preview: true });
      covered = false;
      previewing = true;
      return;
    }
    const top = preview?.topLine() ?? 0;
    // Scroll the editor before the preview fades off it, so it doesn't jump into place.
    if (top === 0) {
      // Back to the top of the page, padding included, not just the first line.
      view.dispatch({
        effects: EditorView.scrollIntoView(0, { y: "start", yMargin: view.documentPadding.top }),
      });
    } else {
      const line = Math.min(top + 1, view.state.doc.lines);
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "start" }),
      });
    }
    previewing = false;
    // The editor can't take focus until it's no longer inert.
    await tick();
    view.focus();
  }

  /** Ticks or unticks the task list item on 0-based source `line`; false if it isn't one. */
  function toggleTask(line: number): boolean {
    if (line >= view.state.doc.lines) return false;
    if (locked) {
      exclusive(askToUnlock);
      return false;
    }
    const changes = taskToggle(view.state.doc, line);
    if (!changes) return false;
    view.dispatch({
      changes,
      // Each tick is its own undo step.
      annotations: isolateHistory.of("full"),
    });
    return true;
  }

  /** Applies a Format menu command (W-060) to the selection, as one undo step. */
  function format(id: string) {
    // The menu is disabled then, but a shortcut may still get here. The find bar keeps its keys.
    if (previewing || locked || document.activeElement instanceof HTMLInputElement) return;
    const spec = formatCommands[id](view.state);
    if (spec) {
      view.dispatch(spec, { annotations: isolateHistory.of("full"), scrollIntoView: true, userEvent: "input.format" });
    }
    view.focus();
  }

  /** Undo/redo also work in preview, which is re-rendered to show the result. */
  function runHistory(command: typeof undo) {
    // The menu shortcut also reaches us while typing in the find bar; undo there.
    if (document.activeElement instanceof HTMLInputElement) {
      document.execCommand(command === undo ? "undo" : "redo");
      return;
    }
    if (locked) {
      if ((command === undo ? undoDepth : redoDepth)(view.state) > 0) exclusive(askToUnlock);
      return;
    }
    if (command(view) && previewing) {
      previewHtml = render({ preview: true });
      // Undo may bring back a code block in a language not loaded yet.
      codeLanguages().then(() => {
        if (previewing) previewHtml = render({ preview: true });
      });
    }
  }

  async function showError(err: unknown) {
    await message(String(err), { title: "Awen", kind: "error" });
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
    const lock = info.locked ?? locked;
    try {
      // A locked file can't be renamed, moved or tagged, so unlock it first.
      if (path && locked) await setFileLocked(path, false);
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
      // Locking keeps the document as saved, so unsaved edits are saved first.
      if (lock && (!dirty || (await write(target)))) await setFileLocked(target, true);
    } catch (err) {
      // Don't leave a file unlocked because a rename failed.
      if (path && lock) await setFileLocked(path, true).catch(() => {});
      await showError(err);
    }
    await refreshLocked();
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
    const target = await pickExportTarget(path, prefs.exportFormat);
    if (!target) return;
    if (target.format !== prefs.exportFormat) {
      prefs.exportFormat = target.format;
      setPreference("exportFormat", target.format);
    }
    const text = documentText(view);
    try {
      if (target.format === "pdf") {
        // The PDF is printed from the page, so render the print copy first.
        await codeLanguages();
        printHtml = render();
        await printCopyReady();
        await exportPdf(target.path);
      } else {
        await writeDocument(target.path, await exportHtml(text, baseName(path)));
      }
    } catch (err) {
      await showError(err);
    }
  }

  async function print() {
    await codeLanguages();
    printHtml = render();
    await printCopyReady();
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
    find: () => inEditor(() => openFind(view, false)),
    find_replace: () => inEditor(() => openFind(view, true)),
    find_next: () => inEditor(() => findNext(view)),
    find_previous: () => inEditor(() => findPrevious(view)),
    find_selection: () => findSelection(view),
    preview: togglePreview,
    word_count: () => changeView("word_count"),
    code_highlighting: () => changeView("code_highlighting"),
    text_bigger: () => changeView("text_bigger"),
    text_smaller: () => changeView("text_smaller"),
    text_actual: () => changeView("text_actual"),
    ...Object.fromEntries(Object.keys(formatCommands).map((id) => [id, () => format(id)])),
  };

  /** A View menu preference, applied here at once so key repeats build on it, then in every window. */
  function changeView(id: string) {
    const change = viewChange(id, prefs);
    if (!change) return;
    Object.assign(prefs, change);
    setPreferences(change);
  }

  /** Find works on the text, so it leaves preview first. */
  async function inEditor(command: () => unknown) {
    if (previewing) await togglePreview();
    command();
  }

  /** Commands that must stay responsive, so they skip the file-command queue. */
  const immediate = new Set([
    "undo",
    "redo",
    "find",
    "find_replace",
    "find_next",
    "find_previous",
    "find_selection",
    "preview",
    "word_count",
    "code_highlighting",
    "text_bigger",
    "text_smaller",
    "text_actual",
    ...Object.keys(formatCommands),
  ]);

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
    applyAccent();
    view = new EditorView({ state: newState(""), parent: host });
    view.focus();

    // App chrome has no web context menu, like native UI.
    const blockChromeMenu = (e: MouseEvent) => {
      if ((e.target as Element).closest(".chrome")) e.preventDefault();
    };
    document.addEventListener("contextmenu", blockChromeMenu);

    // WebKit draws a broken-image icon for an image that fails to load; show its alt text instead.
    const replaceBrokenImage = (e: Event) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.closest(".preview")) return;
      const alt = document.createElement("span");
      alt.className = "missing-image";
      alt.textContent = img.alt || "Image not found";
      alt.title = img.getAttribute("src") ?? "";
      img.replaceWith(alt);
    };
    // Load errors don't bubble, so listen in the capture phase.
    document.addEventListener("error", replaceBrokenImage, true);

    loadPreferences().then((saved) => {
      prefs = saved;
      prefsLoaded = true;
    });

    const unlisten = [
      // Preferences are app-wide: every window follows a change made in any of them.
      onPreferenceChanged((change) => Object.assign(prefs, change)),
      // Rust sends menu commands to the focused window only.
      appWindow.listen<string>("menu", ({ payload }) => {
        // Editing commands must stay responsive; file commands shouldn't overlap.
        if (immediate.has(payload)) return actions[payload]();
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
        if (!focused) return;
        setMenuChecked("preview", previewing);
        setMenuChecked("word_count", prefs.wordCount);
        setMenuChecked("code_highlighting", prefs.codeHighlighting);
        setFormatEnabled(!previewing && !locked);
        refreshLocked();
        // The user may have changed it in System Settings meanwhile.
        applyAccent();
      }),
    ];
    // Only once listening: after this, Rust sends documents as `load-document` events.
    Promise.all(unlisten)
      .then(() => takeInitialDocument())
      .then((doc) => doc && load(doc.text, doc.path));

    return () => {
      document.removeEventListener("contextmenu", blockChromeMenu);
      document.removeEventListener("error", replaceBrokenImage, true);
      unlisten.forEach((p) => p.then((fn) => fn()));
      clearTimeout(countTimer);
      view.destroy();
    };
  });
</script>

<!-- Settings' writing tokens go here, not on :root, so print and PDF keep paper typography. -->
<div class="app-root flex h-full flex-col bg-surface" style={writingStyle(prefs)}>
  <TitleBar
    bind:this={titleBar}
    {os}
    {name}
    {dirty}
    {locked}
    {previewing}
    {renaming}
    onTogglePreview={togglePreview}
    onRename={() => exclusive(rename)}
  />
  <!-- Preview dissolves in over the editor, which stays laid out beneath so its scroll can be set. -->
  <div class="relative min-h-0 flex-1">
    <main class="h-full" class:invisible={previewing && covered} inert={previewing} bind:this={host}></main>
    {#if previewing}
      <div
        class="absolute inset-0 bg-surface"
        in:previewFade={{ entering: true, reduceMotion: prefersReducedMotion() }}
        out:previewFade={{ entering: false, reduceMotion: prefersReducedMotion() }}
        onintroend={() => (covered = true)}
      >
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
  {#if prefsLoaded && prefs.wordCount}
    <!-- The editor's selection is hidden in preview, so preview shows the whole document. -->
    <WordCount text={formatCount(words, previewing ? null : selectedWords)} />
  {/if}
</div>

<div class="print-root" aria-hidden="true">
  <article class="preview paper" bind:this={printArticle}>{@html printHtml}</article>
</div>
