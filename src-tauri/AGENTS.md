# src-tauri: Rust / native side

Notes for working in the Tauri backend. The root `AGENTS.md` and `docs/agents/` cover the app as a whole.

## Layout
- `src/lib.rs`: app builder (plugins, menu, menu-event forwarding) and the small file/print commands.
- `src/menu.rs`: native menus. `FORWARDED` lists the ids that are emitted to the focused window as `menu` events.
- `src/documents.rs`: document windows: creating and cascading them, the label → path map, opening files (including from Finder/Explorer: `open_external`), Quit sequencing.
- `src/terminate.rs`: macOS only: adds `applicationShouldTerminate:` to tao's app delegate so system quit requests prompt about unsaved changes.
- `src/recent.rs`: File → Open Recent list, persisted to `recent.json` in the app data dir, and mirrored into the Dock menu / Jump List.
- `src/export.rs`: `choose_export` (macOS native export sheet) and `export_pdf` (macOS WKWebView / Windows WebView2).
- `capabilities/default.json`: permissions for plugin and core APIs used by the frontend.
- `tauri.conf.json`: window config (Overlay title bar on macOS), CSP, bundle settings.

## Conventions
- Commands return `Result<T, String>` with a user-readable message. The frontend shows it in a native error dialog.
- Commands that wait on native UI or callbacks are `async`. They run the native part on the main thread via `window.with_webview(...)`, send the result over a `std::sync::mpsc` channel, and wait with `tauri::async_runtime::spawn_blocking(move || rx.recv())`.
- To keep `generate_handler!` free of `cfg` attributes, platform-specific commands exist on every OS. Unsupported OSes get a stub returning `Err`.
- Platform dependencies are target-scoped in `Cargo.toml`:
  - macOS: `objc2`, `objc2-app-kit`, `objc2-foundation`, `objc2-web-kit`, `objc2-uniform-type-identifiers`, `block2`;
  - Windows: `webview2-com`, `windows`, `tauri-plugin-single-instance`.
  - Keep their major versions in step with the versions Tauri/wry already use (check `Cargo.lock`), so no second copy gets compiled.
- Run `cargo fmt` and `cargo clippy` before finishing; clippy must be clean.

## objc2 patterns used (macOS)
- `define_class!` creates Objective-C target/delegate objects:
  - `FormatTarget` handles the popup action;
  - `PdfDelegate` handles `printOperationDidRun:success:contextInfo:`.
  - Bring `objc2::DefinedClass` into scope to call `.ivars()`.
- AppKit controls hold their target weakly. The save panel's completion block captures the target to keep it alive.
- Print operations don't retain their delegate. One `PdfDelegate` lives in a main-thread `thread_local!`, and the per-call `Sender` travels through `contextInfo` as a `Box` that is reclaimed exactly once.
- wry's own `print_with_options` (`wry/src/wkwebview/mod.rs`) is a useful reference for WKWebView printing.

## Windows
- This code cannot be compiled on the dev Mac (see `docs/agents/gotchas.md`). After touching `#[cfg(windows)]` code, say it's unverified. Fixes from a real Windows build should be recorded in gotchas.md.
