# Architecture

How the parts of Writer connect. File-level detail is discoverable from the code; this covers the flows that span several files.

## Shape of the app

- **Frontend: a static SPA.** It uses SvelteKit with adapter-static and `ssr = false` (`src/routes/+layout.ts`). Every document window loads the same page. One route, `src/routes/+page.svelte`, owns its window's:
  - the document state: `path`, `dirty`, `savedText`;
  - file actions and the unsaved-changes prompt;
  - preview toggling, export and print.
- **Backend: thin Rust commands** plus native menus and platform code. Frontend wrappers for every command live in `src/lib/files.ts`.

## Menu → event → action

1. `src-tauri/src/menu.rs` builds the native menus.
2. When a menu item whose id is in `FORWARDED` is clicked, `lib.rs` emits a `menu` event with the id as its payload **to the focused window only** (`documents::emit_to_focused`).
3. `+page.svelte` listens with `appWindow.listen` (not the global `listen`, which would hear every window's events) and dispatches through its `actions` map.

Details:
- File actions are serialized by a `busy` flag. Undo/redo/preview bypass it so they stay responsive.
- Undo/redo are custom menu items rather than `PredefinedMenuItem`s. They call CodeMirror's `undo`/`redo` (see decisions.md).
- Close calls `appWindow.close()`. `onCloseRequested` runs `confirmDiscard()` (Save / Don't Save / Cancel) and can prevent the close.
- New and Quit never reach the frontend (see Document windows). Open does, unless no window is focused; then Rust shows the Open dialog itself.
- On macOS, Quit lives in the app menu; on other OSes, File has Exit.

## Document windows (`src-tauri/src/documents.rs`)

- One document per window. Rust creates windows from the `tauri.conf.json` window config (so per-OS settings apply) and keeps a map of window label → file path.
  - The first window is `main`, the only one the window-state plugin remembers. If `main` is closed, the next new window takes the label back. Others are `doc-N`, cascaded 22pt from the focused window.
- **Opening** (`open_path`): brings forward the window already showing the file; otherwise reads it in Rust and loads it into the asking window if that is an untouched Untitled document (`reuse`), or else into a new window. A new window collects its text on mount with `take_initial_document`. Rust notes/forgets Open Recent entries here; the frontend only notes Save As, and reports the new path with `set_document_path`.
- **Closing the last window:** `RunEvent::ExitRequested` without a code is prevented on macOS, so the app stays in the Dock; `RunEvent::Reopen` (Dock click) opens a new window. On Windows the app exits.
- **Quit** sets a `quitting` flag and closes windows one at a time (focused first). Each window's close handler may prompt; after each `Destroyed` event Rust closes the next, and exits when none are left. Cancel calls `cancel_quit`, which ends the sequence.
- The View → Preview checkmark is app-wide, so each window restates its own state when it gains focus.

## Open Recent (`src-tauri/src/recent.rs`)

- Rust owns the list (max 10, newest first), stored as a JSON array of paths in `<app data dir>/recent.json`, and rebuilds the File → Open Recent submenu whenever it changes.
- Document items have the id `recent:<full path>`. Clicking one emits an `open-recent` event with the path (not a `menu` event) to the focused window, which opens it through the same `busy` guard as other file actions. With no window open, Rust opens it directly. Clear Menu is handled entirely in Rust.
- Rust notes a file when it opens and forgets one that fails to open (moved or deleted). The frontend calls `noteRecentDocument` when Save As writes to a new path.
- Labels are the file name, with ` — folder` added when two entries share a name, as macOS does.

## Editor (`src/lib/editor/`)

- `setup.ts` creates a fresh `EditorState` per document. Loading a document into an existing window calls `view.setState(createState(...))` instead of recreating the `EditorView`.
- Line endings: `EditorState.lineSeparator` is set to the separator detected in the file, and `documentText(view)` returns `state.sliceDoc()`. Together these make a round trip byte-identical. Always read text through `documentText()`.
- `markdownStyling.ts` dims syntax marks via a `HighlightStyle` (`--markup` colour). A `ViewPlugin` decorates leading `#` marks with `.cm-hanging-mark`, which is absolutely positioned and translated left so headings hang into the margin.
- Layout: a centered column (`max-width: var(--measure)`, 66ch) with bottom padding of 40vh, so the end of the text can scroll up the screen.

## Rendering (`src/lib/preview/render.ts`)

- There is one markdown-it instance, shared by preview, print, PDF and HTML export. Settings: `html: false`, `linkify`, `typographer`, plus `markdown-it-task-lists`.
- `renderMarkdown(text, { sourceLines: true })` adds `data-line="<source line>"` to block tokens. Only the in-app preview uses this, to match scroll position. Exports omit it.

## Preview (replace-style)

- `togglePreview()` in `+page.svelte` works in two directions:
  - **Into preview:** reads the editor's top visible line, renders, and mounts `Preview.svelte` in place of the editor.
  - **Back to the editor:** asks the preview for its top `data-line` and scrolls the editor there.
- The `EditorView` stays mounted and is only hidden (`class:hidden`), so undo history, selection and scroll survive.
- `Preview.svelte` intercepts every link click:
  - `#anchor` links scroll within the preview;
  - http(s)/mailto links open via `@tauri-apps/plugin-opener`;
  - nothing ever navigates the webview.
- Esc also exits.

## Print, PDF and HTML export

- **Print copy.** `+page.svelte` renders the document into a hidden `<div class="print-root">`. Under `@media print`, `app.css` hides `.app-root` and shows only `.print-root`.
- **Paper typography.** The `@media print` block in `preview.css` sets black on white, full width, and page-break rules.
- **Print… (Cmd+P).** Renders the print copy, then calls the `print_page` command, which opens the system print dialog.
- **Export… (Cmd+Shift+E):**
  - `pickExportTarget()` in `files.ts` returns `{ path, format }`.
    - On macOS it calls `choose_export`: a native NSSavePanel sheet with an "Export To: HTML/PDF" popup, modelled on `Inspiration/export.png`.
    - On other OSes it uses the dialog plugin's save dialog, with HTML/PDF filters ("Save as type") and the format taken from the extension.
  - **PDF:** renders the print copy, then `export_pdf` prints the page straight to the file. This does not go through the print dialog.
  - **HTML:** `src/lib/export/html.ts` builds a single self-contained file. It includes `preview.css` imported via `?raw`, its own light/dark tokens, and the Classic Mono fonts fetched from `/fonts` and embedded as base64 (~235 KB for a small document).
- The export format last used is remembered only for the session (`exportFormat` in `+page.svelte`).

## Theming

- `platform.ts` sets `<html data-os="mac|windows|linux">`.
- `app.css` defines the shared tokens and light/dark defaults. `tokens.mac.css` and `tokens.windows.css` override them per OS: UI font, sizes, radii, accent, surfaces, scrollbars.
- Tailwind v4 exposes the tokens as utilities through `@theme inline` (`bg-surface`, `text-muted`, `font-ui`, `font-writing`, `rounded-control`).
- The writing font is Classic Mono (`static/fonts/`, SIL OFL; keep `LICENSE.md` beside it).
- **Title bar:** `src/lib/ui/TitleBar.svelte`, used by `+page.svelte`.
  - **macOS:** `titleBarStyle: "Overlay"` + `hiddenTitle` puts the traffic lights inline over our draggable header, which shows "name — Edited" centered and toolbar buttons at the trailing edge.
  - **Windows:** `decorations: false` (in `tauri.windows.conf.json`). `TitleBar` draws the whole bar: title `*name - Writer`, toolbar buttons, then minimize/maximize/close using Segoe Fluent Icons glyphs. It tracks maximized/focused state to swap the restore icon and dim when inactive.
  - Linux keeps native decorations and has no toolbar yet.
  - `appWindow.setTitle()` still runs on every OS, so the taskbar/Dock and Window menu stay right.
- **Toolbar buttons:** `src/lib/ui/ToolbarButton.svelte`, sized by `--toolbar-button-*` tokens.
  - They cancel `mousedown` so they never steal focus from the editor.
  - Toggle buttons pass `pressed`.
  - A toolbar toggle that also has a menu item should use a `CheckMenuItem`, synced from frontend state the way Preview is (`set_preview_checked`).
- **Planned:** Bits UI headless components wrapped in `src/lib/ui/`, themed by the tokens. Konsta UI on mobile.
