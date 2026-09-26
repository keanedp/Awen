# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others) when working with code in this repository.

Writer is a focused Markdown editor in the style of focused editors, built with Tauri 2 (Rust) + SvelteKit (Svelte 5 runes, TypeScript) + CodeMirror 6. Targets: macOS and Windows now, iOS/Android later from the same codebase. The overriding design goal is to look and behave as native as possible on each OS.

## Commands

- `make dev` (`npm run tauri dev`): run the app with hot reload.
- `make build` (`npm run tauri build`): release bundle (`.app` + `.dmg` on macOS, in `src-tauri/target/release/bundle/`). If DMG bundling fails, a previous build's Writer is usually still running from a mounted `/Volumes/dmg.*` volume. Quit it, then `hdiutil detach` the volume.
- `npm run check`: svelte-check (TypeScript + Svelte). Must report 0 errors/warnings.
- `npm run build`: frontend-only static build (fast sanity check).
- `cd src-tauri && cargo clippy` / `cargo fmt`: Rust lint/format. Keep clippy warning-free.

There is no test suite. Verify changes with `npm run check`, `cargo clippy`, and by running the app.

The Windows-only Rust code (`#[cfg(windows)]`) cannot be compiled on this Mac (no rustup/cross targets). Treat it as unverified.

## Architecture

**Frontend is a static SPA** (adapter-static, `ssr = false`). Almost all app logic is in `src/routes/+page.svelte`:
- document state: path, dirty flag, saved text
- file actions and unsaved-changes prompts
- preview toggling, export and print

**Native menus drive the app.** `src-tauri/src/menu.rs` builds the menus. Clicking an item whose id is in `FORWARDED` emits a `menu` event (payload = id) to the frontend. `+page.svelte` dispatches it through its `actions` map.
- To add a command, add the menu item + id in `menu.rs`, then add a handler in `actions`.
- File actions are serialized by a `busy` guard; undo/redo/preview bypass it.
- Undo/redo are custom menu items (not `PredefinedMenuItem`) because native accelerators would swallow Cmd+Z before CodeMirror sees it.
- macOS puts Quit in the app menu; other OSes put Exit in File. Close/Quit go through `onCloseRequested`, which prompts about unsaved changes.

**Rust commands** (`src-tauri/src/lib.rs`, `export.rs`) are thin:
- `read_document` / `write_document`
- `print_page`
- `choose_export`: a native NSSavePanel sheet with an "Export To" format popup on macOS; on other OSes it errors, and the frontend uses the dialog plugin's "Save as type" filters instead.
- `export_pdf`: prints the current webview page to a PDF. macOS uses a WKWebView print operation with `NSPrintSaveJob`; Windows uses WebView2 `PrintToPdf`.

Frontend wrappers live in `src/lib/files.ts`. New Tauri permissions go in `src-tauri/capabilities/default.json`.

**Editor** (`src/lib/editor/`):
- `setup.ts` builds a fresh `EditorState` per document. `+page.svelte` replaces the state on open/new rather than recreating the view.
- Original line endings are preserved: `EditorState.lineSeparator` is detected from the file, and text is read back with `documentText()` (`state.sliceDoc()`). Always use that rather than `doc.toString()` when saving/exporting.
- `markdownStyling.ts` dims Markdown syntax marks and hangs `#` heading marks into the left margin.

**Rendering** (`src/lib/preview/render.ts`) is the single markdown-it instance used by preview, print, and export.
- `html: false` is deliberate: rendered content runs in a webview with IPC access, so raw HTML must never be enabled.
- `{ sourceLines: true }` adds `data-line` attributes, used only by the in-app preview to keep the scroll position when toggling.
- The task-list plugin is `markdown-it-task-lists`. `@hedgedoc/markdown-it-task-lists` is incompatible with markdown-it 14. Its types are in `markdown-it-task-lists.d.ts`.

**Preview is replace-style** (like focused editors). `Preview.svelte` swaps in for the editor. The `EditorView` stays mounted but hidden, so undo history/selection survive.
- Links never navigate the webview: http(s)/mailto open via the opener plugin.

**Print and PDF share one mechanism.**
- `+page.svelte` renders the document into a hidden `.print-root` element.
- `@media print` rules in `app.css` hide `.app-root` and show only that copy.
- `preview.css` holds the paper typography.
- PDF export renders `.print-root` first, then calls `export_pdf`.

**HTML export** (`src/lib/export/html.ts`) produces one self-contained file:
- It inlines `preview.css` (`?raw`), its own light/dark colour tokens, and the Classic Mono fonts as base64 data URLs.
- The fonts are fetched from `/fonts` at export time.

## Platform theming

- `src/lib/platform.ts` sets `<html data-os="mac|windows|linux">`.
- `src/styles/tokens.mac.css` / `tokens.windows.css` override the shared CSS custom properties in `app.css` (fonts, sizes, radii, accent, surfaces, scrollbars) per OS. Tailwind v4 utilities map to these tokens via `@theme inline` (`bg-surface`, `text-muted`, `font-ui`, …).
- Style with tokens, not hard-coded colours. Light/dark comes from `prefers-color-scheme` in the token files.
- The macOS window uses `titleBarStyle: "Overlay"` + `hiddenTitle`, so traffic lights sit inline. `+page.svelte` draws its own draggable title header on mac only (`data-tauri-drag-region`). Windows uses the native title bar, and the window title follows each OS's convention (`*name - Writer` vs `name — Edited`).
- Elements with the `.chrome` class behave like native UI: no text selection, default cursor, no web context menu.
- UI components are planned as headless Bits UI wrapped in `src/lib/ui/`, themed by the token files; Konsta UI for mobile. Vibrancy/Mica is deferred because it needs `macOSPrivateApi` (blocks the Mac App Store).

## Conventions

- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`).
- Bundled fonts (`static/fonts/`, SIL OFL) must keep their `LICENSE.md` alongside.
- `Inspiration/` holds UI reference screenshots (e.g. `export.png` for the export sheet).
- GNU sed is aliased as `sed` on this machine: use `sed -i`, not `sed -i ''`. `grep` is ugrep.
