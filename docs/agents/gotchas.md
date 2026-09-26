# Gotchas

Traps already hit in this repo. Add new ones as you find them, and remove any that stop being true.

## Machine / shell
- `sed` is GNU sed: use `sed -i`, not `sed -i ''`.
- `grep` is ugrep, so some regex syntax differs from GNU grep. For example, `(\.|--|...)` alternations failed.
- There is no `rustup` (Rust comes from Homebrew), so there are no cross targets. `#[cfg(windows)]` code **cannot be compiled here**. Write it against the crate sources and flag it as unverified.
- **Never run a bare `cargo fetch`.** It downloads and unpacks dependencies for every platform, including the huge `windows` crates, and once filled the disk (every command then fails with ENOSPC). To read one crate's source, download just that `.crate` from `https://static.crates.io/crates/<name>/<name>-<ver>.crate` into a scratch directory.

## Build / bundle
- **DMG bundling fails** with `error running bundle_dmg.sh`. The cause is a Writer launched from the temporary `/Volumes/dmg.*` mount during a previous build, which blocks the eject. Fix: quit that app, `hdiutil detach -force /Volumes/dmg.*`, delete `src-tauri/target/release/bundle/macos/rw.*.dmg`, and rebuild. Don't open the app from the Finder window that pops up during `make build`.
- `src-tauri/gen/schemas/` is regenerated every build, so don't edit or commit it.

## Frontend
- `@hedgedoc/markdown-it-task-lists` crashes with markdown-it 14 (`ERR_PACKAGE_PATH_NOT_EXPORTED` for `markdown-it/lib/token.js`). Use `markdown-it-task-lists`, whose types come from the local `src/lib/preview/markdown-it-task-lists.d.ts`.
- CSS custom properties can't take a fallback list like a font stack: `--accent: -apple-system-control-accent, #0a84ff` is invalid. Use a single value, which is WebKit-only and follows System Settings on macOS.
- **Testing a module outside the app:** `ssrLoadModule` resolves `$lib` and `?raw` imports, but it runs in SvelteKit's dev server, which replaces the global `fetch` and rejects relative URLs. Stub `fetch` *after* `createServer()`.
- **Never style scrollbars on macOS.** Any `::-webkit-scrollbar` rule makes WKWebView swap native overlay scrollbars (hidden until you scroll or hover) for legacy always-visible ones. The mac token file intentionally has none. The Windows token file does style them.
- Accessibility warnings from svelte-check: prefer a document-level listener (e.g. the `.chrome` context-menu blocker) over handlers on non-interactive elements.

## Tauri / native
- `tauri.<platform>.conf.json` is merged with JSON Merge Patch, so **arrays are replaced, not merged**. `tauri.windows.conf.json` must repeat the whole `app.windows[0]` object, not just the changed key. Keep both files' window settings in step.
- `data-tauri-drag-region` only starts a drag when the clicked element itself carries the attribute. Buttons inside the title bar are therefore not drag handles, but any text or icon *wrappers* that should drag need the attribute too, or `pointer-events: none`, as the title text has.
- The `.menu(...)` builder runs before Tauri manages its `PathResolver`, so calling `app.path()` there panics with `state() called before manage()`. Do path-dependent work in `.setup(...)`, as `recent::load` does.
- `Menu::get(id)` only searches top-level items. To reach a nested item later (e.g. the View → Preview checkmark), keep its handle in managed state (`menu::PreviewMenuItem`).
- Windows custom title bar: HTML caption buttons don't trigger the Snap Layouts flyout (W-037). Win+Z and dragging to screen edges still work.
- A native menu accelerator consumes the key before the webview sees it. Any shortcut CodeMirror must handle has to be a custom menu item that calls into the editor, as undo/redo do.
- Tauri app-defined commands need no capability entry. Plugin APIs do: add them to `src-tauri/capabilities/default.json`, e.g. `opener:default` and `dialog:default`.
- **macOS PDF export, not yet confirmed by running it.** WKWebView print operations can render blank pages unless run with `runOperationModalForWindow…` and the print view's frame set. `export.rs` does both. If PDFs come out blank or as one long page, look here first.
- **WebView2 `PrintToPdf`** (Windows) prints with default settings, where backgrounds are off. Checked task-list boxes may lose their fill in Windows PDFs.
