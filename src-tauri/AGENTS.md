# src-tauri: Rust / native side

Notes for working in the Tauri backend. The root `AGENTS.md` and `docs/agents/` cover the app as a whole.

## Layout
- `src/lib.rs`: app builder (plugins, menu, menu-event forwarding) and the small file/print commands.
- `src/menu.rs`: native menus. `FORWARDED` lists the ids that are emitted to the focused window as `menu` events.
- `src/menubar.rs`: Windows only: runs the title bar's menu bar (`track_menu_bar`): native popups, plus a message filter hook to move between them.
- `src/documents.rs`: document windows: creating and cascading them, the label → path map, opening files (including from Finder/Explorer: `open_external`), Quit sequencing.
- `src/terminate.rs`: macOS only: adds `applicationShouldTerminate:` to tao's app delegate so system quit requests prompt about unsaved changes.
- `src/recent.rs`: File → Open Recent list, persisted to `recent.json` in the app data dir, and mirrored into the Dock menu / Jump List.
- `src/rename.rs`: the macOS title popover (Name, Tags, Where, Locked) and the commands that apply it: `move_document`, `create_document`, `set_file_tags`, `set_file_locked` / `is_file_locked`.
- `src/preferences.rs`: app-wide preferences, persisted to `preferences.json` in the app data dir; `set_preference` broadcasts `preference-changed` to every window. Applies the `theme` preference to the app.
- `src/settings.rs`: the Settings window (`show`, opened hidden; the page shows it once sized).
- `src/spelling.rs`: the system spell checker for the editor's marks (`NSSpellChecker` / `ISpellChecker`): check, suggestions, learn, ignore. Synchronous commands, so they run on the main thread.
- `src/accent.rs`: `accent_colors`, the system accent fill and text colors for light and dark (`NSColor.controlAccentColor` / `UISettings`), read by `applyAccent()` in `platform.ts`.
- `src/export.rs`: `choose_export` (macOS native export sheet) and `export_pdf` (macOS WKWebView / Windows WebView2).
- `capabilities/default.json`: permissions for plugin and core APIs used by document windows; `capabilities/settings.json` for the Settings window.
- `tauri.conf.json`: window config (Overlay title bar on macOS), CSP, bundle settings.

## Conventions
- Commands return `Result<T, String>` with a user-readable message. The frontend shows it in a native error dialog.
- Commands that wait on native UI or callbacks are `async`. They run the native part on the main thread via `window.with_webview(...)`, send the result over a `std::sync::mpsc` channel, and wait with `tauri::async_runtime::spawn_blocking(move || rx.recv())`.
- To keep `generate_handler!` free of `cfg` attributes, platform-specific commands exist on every OS. Unsupported OSes get a stub returning `Err`.
- Platform dependencies are target-scoped in `Cargo.toml`:
  - macOS: `objc2`, `objc2-app-kit`, `objc2-foundation`, `objc2-web-kit`, `objc2-uniform-type-identifiers`, `block2`;
  - Windows: `webview2-com`, `windows`, `windows-sys` (`menubar.rs`), `tauri-plugin-single-instance`.
  - Keep their major versions in step with the versions Tauri/wry already use (check `Cargo.lock`), so no second copy gets compiled.
- Run `cargo fmt` and `cargo clippy` before finishing; clippy must be clean.

## objc2 patterns used (macOS)
- `define_class!` creates Objective-C target/delegate objects:
  - `FormatTarget` handles the popup action;
  - `PdfDelegate` handles `printOperationDidRun:success:contextInfo:`.
  - `rename::Controller` is a popover, text field and token field delegate in one.
  - Bring `objc2::DefinedClass` into scope to call `.ivars()`.
  - A `bool`-returning method can't use an early `return false` inside `define_class!` (it fails with "expected `Bool`, found `bool`"); make the last expression the result.
- AppKit controls hold their target weakly. The save panel's completion block captures the target to keep it alive.
- Popovers and text fields hold their delegate weakly too. `rename.rs` keeps the latest controller in a main-thread `thread_local!` until the next popover replaces it.
- Print operations don't retain their delegate. One `PdfDelegate` lives in a main-thread `thread_local!`, and the per-call `Sender` travels through `contextInfo` as a `Box` that is reclaimed exactly once.
- wry's own `print_with_options` (`wry/src/wkwebview/mod.rs`) is a useful reference for WKWebView printing.

## App icon
- `src-tauri/icons/` is generated from a rounded source in the repo's `icons/` folder: `npm run tauri icon icons/<name>_rounded.png`.
- A rounded source comes from a square, full-bleed 1254px artwork. It follows the macOS icon grid: the art is scaled to 824px, masked to a rounded rectangle with a 185px radius, then centerd on a transparent 1024 canvas (100px margin):
  `magick in.png -resize 824x824 \( -size 824x824 xc:black -fill white -draw "roundrectangle 0,0 823,823 185,185" \) -alpha off -compose CopyOpacity -composite -compose Over -background none -gravity center -extent 1024x1024 out_rounded.png`

## Windows
- This code cannot be compiled on the dev Mac (see `docs/agents/gotchas.md`), but CI's Windows job compiles and lints it on every PR. After touching `#[cfg(windows)]` code, check that job and say the code is still unverified on a real machine. Fixes from a real Windows build should be recorded in gotchas.md.
