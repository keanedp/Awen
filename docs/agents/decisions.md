# Decisions

A dated log of design decisions and the reasons for them. Newest first. Add an entry when you make a choice a future agent might otherwise reverse. If a decision is superseded, mark it rather than deleting it.

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
It works with markdown-it 14. `@hedgedoc/markdown-it-task-lists` has types but crashes (see gotchas.md). Checkboxes are read-only in preview, and they are custom-drawn in CSS for consistency across webviews.

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
