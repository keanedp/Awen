# Driving the running app (agents)

Agents can launch the dev build and use it the way a person would: read the DOM, click, type, take screenshots, read console logs, call Tauri commands and emit events. This uses [mcp-server-tauri](https://github.com/hypothesi/mcp-server-tauri) (see decisions.md, 2026-10-10).

## How it's wired

- **Rust plugin:** `tauri-plugin-mcp-bridge`, registered in `src-tauri/src/lib.rs` under `#[cfg(debug_assertions)]`, so release builds never start it. It serves a WebSocket on `127.0.0.1:9223` (or the next free port up to 9322). Keep it bound to localhost: the default `0.0.0.0` would let anyone on the network run JS in the app.
- **Permission:** `mcp-bridge:default` in both capabilities (`default.json` for document windows, `settings.json` for Settings).
- **`withGlobalTauri`:** the bridge needs it, so it's turned on only in `src-tauri/tauri.dev.conf.json`, which `npm run app:dev` (and `make dev`) passes with `--config`. A plain `npm run tauri dev` leaves it off and the MCP server can't drive the webview.
- **MCP server:** the pinned dev dependency `@hypothesi/tauri-mcp-server`, started by Claude Code from `.mcp.json` (stdio). Other agents can point their MCP config at `node node_modules/@hypothesi/tauri-mcp-server/dist/index.js`. Keep the npm and crate versions in step.

## Workflow

1. Start the app in the background: `npm run app:dev` (first build takes minutes). Wait for the window.
2. `driver_session` `start` connects to the running app. `manage_window` `list` shows the windows (`main`, `doc-*`, `settings`); pass `windowId` to target one.
3. Inspect and act: `webview_dom_snapshot`, `webview_find_element`, `webview_interact`, `webview_keyboard`, `webview_wait_for`, `webview_screenshot`, `read_logs`.
4. `driver_session` `stop`, then stop the dev process.

## Typing into the editor

- **`webview_keyboard` doesn't reach CodeMirror.** `type` fails with "Illegal invocation", and `press` dispatches synthetic key events, which CodeMirror ignores (they aren't trusted). Insert text as real input instead: focus `.cm-content`, then `document.execCommand('insertText', false, text)` through `webview_execute_js`. It goes through the editor's normal input path, so undo, the dirty mark and the word count all update.
- Read the text back with `document.querySelector('.cm-content').innerText`. `el.cmTile.view` is the `EditorView`, if you need its state.
- A syntax error in a `webview_execute_js` script shows up as "Script execution timeout", not as a syntax error. Check the escaping first, especially newlines inside string literals.

## Reaching what the webview can't

- **Menu commands:** native menus can't be clicked. Send the same event Rust does (see architecture.md, Menu → event → action). `+page.svelte` listens with `appWindow.listen`, so target the window: `webview_execute_js` with `window.__TAURI__.event.emitTo(window.__TAURI__.window.getCurrentWindow().label, "menu", "<menu id>")`. Keyboard shortcuts via `webview_keyboard` also work for items the webview handles.
- **Native dialogs** (Open/Save, export, discard confirm) can't be driven. Exercise the logic around them with `ipc_execute_command`, or open files by path; verify the dialog itself by hand.
- **Screenshots** capture the webview only. On Windows that includes Awen's custom title bar and menu titles (they're HTML), but not native menu popups, dialogs or the window frame.
