# Decisions

A dated log of design decisions and the reasons for them. Newest first. Add an entry when you make a choice a future agent might otherwise reverse. If a decision is superseded, mark it rather than deleting it.

## 2026-09-25: Ticking a task in preview edits the hidden editor; undo works in preview
- A click on a preview checkbox changes that one character in the editor's document through a normal CodeMirror transaction, so dirty tracking, undo and saving need nothing extra. The preview isn't re-rendered: the box has already flipped itself, and the click is cancelled if the source line doesn't look like a task.
- Each tick is its own undo step (`isolateHistory`), so Cmd+Z after ticking several boxes steps back one box at a time.
- Undo and Redo used to do nothing in preview. They now apply to the document and re-render the preview, because otherwise Cmd+Z right after ticking a box would seem broken.

## 2026-09-25: Opening from Finder/Explorer reuses a blank window; single instance on Windows
- A file opened from outside the app goes to an untitled window with no changes if there is one, as TextEdit does. Otherwise it follows the Open rules (bring forward, or a new window). Otherwise launching Writer by double-clicking a file would show the file *and* an empty Untitled window.
- Rust decides this itself instead of forwarding to the focused window like Open Recent does. The frontend drops file commands while `busy` (e.g. a dialog is open), and a Finder open must never be dropped.
- Windows uses `tauri-plugin-single-instance` so Explorer opens reach the running app. Without it every double-click starts a separate Writer process, and "already open → bring forward" and Quit would only see that process's windows. It is a Windows-only dependency: macOS LaunchServices already keeps one instance.
- Only `.md` and `.markdown` are registered. The Open dialog also accepts `.txt`, but claiming every text file would be intrusive.

## 2026-09-25: One window per document; the Mac app outlives its windows
Following TextEdit and focused editors: New and Open always make a new window. The exception is an untouched Untitled window, which Open reuses, as NSDocument apps do. On macOS closing the last window leaves the app running. Windows keeps its convention of exiting. Rust owns window creation and the label → path map, so it can open files with no window present (needed for Dock reopen and later for open-with, W-023) and bring an already-open file forward. Quit closes windows one by one so each can prompt, rather than using a single "Review changes" dialog.

## 2026-09-25: Open Recent is our own list, not NSDocumentController
The app isn't NSDocument-based, so AppKit's automatic Open Recent menu isn't available. Rust keeps the list and builds the submenu itself, which also works unchanged on Windows. Adding entries to the system recents (Dock menu, `noteNewRecentDocumentURL:`) only makes sense once Writer registers as a `.md` handler and handles open-file events (rest of W-023).
- Update (W-040): now that it does, our list stays the source of truth for the menu and is *mirrored* into the system list, not replaced by it. The Windows Clear Menu uses `RemoveAllDestinations` rather than `SHAddToRecentDocs(…, NULL)`, which would clear the user's recent files for every app.

## 2026-09-25: Title bar toolbar; custom title bar on Windows
- Preview gets a play button in the title bar, like focused editors. The button, shortcut and menu item all call the same `togglePreview()`. View → Preview is a `CheckMenuItem`, synced from the frontend's state.
- **Windows:** turns off native decorations (`tauri.windows.conf.json`) and draws its own title bar with Segoe Fluent Icons caption buttons, since the native title bar has no room for app buttons.
  - This loses the Windows 11 Snap Layouts flyout on hovering maximize (tracked as W-037).
  - `tauri-plugin-decorum` would provide it, but was rejected: no release since 2024-09.
- **macOS:** keeps the Overlay title bar; the button sits in our existing header.

## 2026-09-25: AGENTS.md is the shared instruction file
`AGENTS.md` and `docs/agents/` serve as memory for Claude Code and Codex alike. Each `CLAUDE.md` contains only `@AGENTS.md`. Symlinks were rejected because the project must also be checked out on Windows.

## 2026-09-25: Export dialog is native per OS; PDF is written directly
- **macOS:** an NSSavePanel sheet with an "Export To" popup, like focused editors (`Inspiration/export.png`). The Tauri dialog plugin can't add accessory views, so it is built with objc2 in `src-tauri/src/export.rs`.
- **Windows:** the native equivalent is the "Save as type" list, which the dialog plugin already supports.
- **PDF** goes straight to the chosen file instead of through the print dialog. Print… remains a separate command.
- Only HTML and PDF are offered for now. Word and Project Archive, from the reference image, are not offered yet.

## 2026-09-25: HTML export is one self-contained file
The CSS and fonts are embedded, so the file looks right anywhere. That size (~235 KB) is accepted. Relative image paths are left as-is, so they resolve when the export is saved next to the Markdown file.

## 2026-09-24: Replace-style preview, not a side panel
It matches focused editors' focused feel, it is the only layout that works at phone width, and it avoids live re-rendering and scroll sync. Position is matched once per toggle via `data-line`.

## 2026-09-24: markdown-it with `html: false`
The webview has access to Tauri's backend (IPC), so a document must not be able to inject HTML or scripts. The default `validateLink` already blocks `javascript:` URLs, so no sanitizer is needed. Don't enable `html` without adding sanitization.

## 2026-09-24: Task lists via `markdown-it-task-lists`
It works with markdown-it 14. `@hedgedoc/markdown-it-task-lists` has types but crashes (see gotchas.md). Checkboxes are custom-drawn in CSS for consistency across webviews.
- Superseded in part (W-012, 2026-09-25): checkboxes are now clickable in the in-app preview. They stay disabled in print and exports.

## 2026-09-23: Custom Undo/Redo menu items
A native accelerator for Cmd+Z swallows the keystroke before CodeMirror sees it. The menu items call CodeMirror's history instead.

## 2026-09-23: Vibrancy/Mica deferred
Window translucency needs a transparent window and `macOSPrivateApi`, which blocks Mac App Store distribution. It will be revisited with the sidebar work.

## 2026-09-23: Headless components + per-OS tokens for native look
The native look comes from Bits UI (headless) + Tailwind, with `data-os` selecting mac or windows token files. There is no single component kit, because none looks native on both macOS and Windows. Konsta UI is planned for mobile.

## 2026-09-23: Tauri 2 + SvelteKit SPA + CodeMirror 6
- **Tauri** was chosen over Electron and Flutter: it uses the system webview (small binary, native menus and dialogs) and targets desktop and mobile from one codebase.
- **SvelteKit** runs as a static SPA because there is no server.
- **CodeMirror 6** provides decoration-based styling, needed for dimmed Markdown marks, hanging headings, and future focus/typewriter modes.

## 2026-09-23: Repo hygiene
- `package-lock.json` and `Cargo.lock` are committed, because this is an app and builds must be reproducible.
- There is one root `.gitignore`.
- `src-tauri/gen/schemas` is ignored because it is regenerated. `gen/android` and `gen/apple` will be committed once created.
- Signing keys are always ignored.

## Roadmap
Planned work is tracked as user stories in `docs/backlog.md`.
