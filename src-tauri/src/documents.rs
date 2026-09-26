//! Document windows: one window per document, like TextEdit and focused editors.
//!
//! Rust creates the windows and remembers which file each one shows, so that
//! opening a file that is already open brings its window forward instead.
//! Quit closes the windows one by one, letting each ask about unsaved changes.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewWindow, WebviewWindowBuilder, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

/// The window from `tauri.conf.json`. It is the only one whose size and
/// position are remembered; later windows cascade from the focused one.
pub const MAIN: &str = "main";

/// How far each new window is offset from the focused one, in points.
const CASCADE: f64 = 22.0;

#[derive(Default)]
pub struct Documents {
    /// Window label → the file it shows (`None` while untitled).
    paths: Mutex<HashMap<String, Option<String>>>,
    /// Text read by Rust for windows that haven't loaded it yet.
    pending: Mutex<HashMap<String, String>>,
    next: AtomicUsize,
    quitting: AtomicBool,
}

#[derive(Serialize)]
pub struct InitialDocument {
    path: String,
    text: String,
}

fn documents(app: &AppHandle) -> tauri::State<'_, Documents> {
    app.state::<Documents>()
}

/// The window menu commands apply to.
pub fn focused_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|w| w.is_focused().unwrap_or(false))
}

/// Opens an empty document window, optionally holding `document` (path, text).
pub fn new_window(app: &AppHandle, document: Option<(String, String)>) -> Result<(), String> {
    let Some(mut config) = app.config().app.windows.first().cloned() else {
        return Err("No window configuration".into());
    };
    let reuse_main = app.get_webview_window(MAIN).is_none();
    if !reuse_main {
        let n = documents(app).next.fetch_add(1, Ordering::Relaxed) + 1;
        config.label = format!("doc-{n}");
    }
    let label = config.label.clone();

    {
        let docs = documents(app);
        let mut paths = docs.paths.lock().map_err(|e| e.to_string())?;
        let mut pending = docs.pending.lock().map_err(|e| e.to_string())?;
        paths.insert(label.clone(), document.as_ref().map(|(p, _)| p.clone()));
        if let Some((_, text)) = document {
            pending.insert(label.clone(), text);
        }
    }

    let mut builder = WebviewWindowBuilder::from_config(app, &config).map_err(|e| e.to_string())?;
    if !reuse_main {
        if let Some((x, y)) = cascade_position(app) {
            builder = builder.position(x, y);
        }
    }
    builder.build().map_err(|e| {
        forget_window(app, &label);
        format!("Could not open a window: {e}")
    })?;
    Ok(())
}

/// Just below and right of the focused window, in logical coordinates.
fn cascade_position(app: &AppHandle) -> Option<(f64, f64)> {
    let from = focused_window(app).or_else(|| app.webview_windows().into_values().next())?;
    let scale = from.scale_factor().ok()?;
    let pos = from.outer_position().ok()?.to_logical::<f64>(scale);
    Some((pos.x + CASCADE, pos.y + CASCADE))
}

fn forget_window(app: &AppHandle, label: &str) {
    let docs = documents(app);
    if let Ok(mut paths) = docs.paths.lock() {
        paths.remove(label);
    }
    if let Ok(mut pending) = docs.pending.lock() {
        pending.remove(label);
    };
}

/// Opens `path`, in this order:
/// 1. brings forward the window that already shows it;
/// 2. loads it into `reuse`, an untouched untitled window, returning its text;
/// 3. opens it in a new window.
pub fn open_path(
    app: &AppHandle,
    path: String,
    reuse: Option<&WebviewWindow>,
) -> Result<Option<String>, String> {
    let open_in = documents(app)
        .paths
        .lock()
        .map_err(|e| e.to_string())?
        .iter()
        .find(|(_, p)| p.as_deref() == Some(path.as_str()))
        .map(|(label, _)| label.clone());
    if let Some(window) = open_in.and_then(|label| app.get_webview_window(&label)) {
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(None);
    }

    let recent = app.state::<crate::recent::Recent<Wry>>();
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) => {
            // Like other Mac apps, a moved or deleted file drops out of Open Recent.
            let _ = recent.forget(app, &path);
            return Err(format!("Could not open {path}: {e}"));
        }
    };
    let _ = recent.note(app, path.clone());

    if let Some(window) = reuse {
        documents(app)
            .paths
            .lock()
            .map_err(|e| e.to_string())?
            .insert(window.label().to_string(), Some(path));
        return Ok(Some(text));
    }
    new_window(app, Some((path, text)))?;
    Ok(None)
}

/// Open… or Open Recent with no window to ask: Rust shows the dialogs itself.
pub fn open_without_window(app: &AppHandle, path: Option<String>) {
    let Some(path) = path else {
        let handle = app.clone();
        app.dialog()
            .file()
            .add_filter("Markdown", &["md", "markdown", "txt"])
            .pick_file(move |file| {
                if let Some(file) = file.and_then(|f| f.into_path().ok()) {
                    open_without_window(&handle, Some(file.to_string_lossy().into_owned()));
                }
            });
        return;
    };
    if let Err(e) = open_path(app, path, None) {
        app.dialog()
            .message(e)
            .title("Writer")
            .kind(MessageDialogKind::Error)
            .show(|_| {});
    }
}

/// Starts quitting: each window is asked to close in turn (see `window_destroyed`).
pub fn quit(app: &AppHandle) {
    documents(app).quitting.store(true, Ordering::SeqCst);
    close_next(app);
}

fn close_next(app: &AppHandle) {
    match focused_window(app).or_else(|| app.webview_windows().into_values().next()) {
        // Goes through the frontend's close handler, which may cancel.
        Some(window) => {
            let _ = window.close();
        }
        None => app.exit(0),
    }
}

pub fn window_destroyed(app: &AppHandle, label: &str) {
    forget_window(app, label);
    if documents(app).quitting.load(Ordering::SeqCst) {
        close_next(app);
    }
}

/// Whether the app should stay running now that its last window has closed.
/// Mac apps do (until Quit); on Windows closing the last window exits.
pub fn keep_running(app: &AppHandle) -> bool {
    cfg!(target_os = "macos") && !documents(app).quitting.load(Ordering::SeqCst)
}

/// Sends a menu command to the focused window only; every window listens.
pub fn emit_to_focused<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) -> bool {
    let Some(window) = focused_window(app) else {
        return false;
    };
    app.emit_to(EventTarget::webview_window(window.label()), event, payload)
        .is_ok()
}

/// The document Rust read for this window before it existed, if any.
#[tauri::command]
pub fn take_initial_document(
    window: WebviewWindow,
    docs: tauri::State<'_, Documents>,
) -> Result<Option<InitialDocument>, String> {
    let label = window.label();
    let text = docs
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .remove(label);
    let path = docs
        .paths
        .lock()
        .map_err(|e| e.to_string())?
        .get(label)
        .cloned()
        .flatten();
    Ok(text
        .zip(path)
        .map(|(text, path)| InitialDocument { path, text }))
}

/// Opens a document from a window. `reuse` says the window is an untouched
/// untitled document that may show it instead of a new window; the text is
/// returned only in that case. Async because creating a window from a
/// synchronous command deadlocks on Windows.
#[tauri::command]
pub async fn open_document(
    app: AppHandle,
    window: WebviewWindow,
    path: String,
    reuse: bool,
) -> Result<Option<String>, String> {
    open_path(&app, path, reuse.then_some(&window))
}

/// Records the window's file after Save As.
#[tauri::command]
pub fn set_document_path(
    window: WebviewWindow,
    docs: tauri::State<'_, Documents>,
    path: String,
) -> Result<(), String> {
    docs.paths
        .lock()
        .map_err(|e| e.to_string())?
        .insert(window.label().to_string(), Some(path));
    Ok(())
}

/// A window kept its unsaved changes, so Quit stops there.
#[tauri::command]
pub fn cancel_quit(docs: tauri::State<'_, Documents>) {
    docs.quitting.store(false, Ordering::SeqCst);
}
