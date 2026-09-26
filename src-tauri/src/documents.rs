//! Document windows: one window per document, like TextEdit and focused editors.
//!
//! Rust creates the windows and remembers which file each one shows, so that
//! opening a file that is already open brings its window forward instead.
//! Quit closes the windows one by one, letting each ask about unsaved changes.
//! Files opened from Finder or Explorer arrive through `open_external`.

use std::collections::{HashMap, HashSet};
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
    /// Windows whose page has mounted and asked for its initial document.
    ready: Mutex<HashSet<String>>,
    /// Windows with unsaved changes (see `set_document_edited`).
    edited: Mutex<HashSet<String>>,
    /// Set once setup has run; files the system asks to open before then wait in `queued`.
    launched: AtomicBool,
    queued: Mutex<Vec<String>>,
    next: AtomicUsize,
    quitting: AtomicBool,
}

#[derive(Clone, Serialize)]
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
    if let Ok(mut ready) = docs.ready.lock() {
        ready.remove(label);
    }
    if let Ok(mut edited) = docs.edited.lock() {
        edited.remove(label);
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

/// Files opened from outside the app: Finder or Explorer, the Dock icon, or the
/// command line. Each goes to an empty untitled window if there is one (the
/// window the app launched with, say), else as `open_path` decides.
pub fn open_external(app: &AppHandle, paths: Vec<String>) {
    let docs = documents(app);
    if !docs.launched.load(Ordering::SeqCst) {
        // AppKit can deliver the files before setup has run; `finish_launching` opens them.
        if let Ok(mut queued) = docs.queued.lock() {
            queued.extend(paths);
        }
        return;
    }
    for path in paths {
        if let Err(e) = open_into_blank(app, path) {
            show_error(app, e);
        }
    }
}

/// Opens the files that arrived while the app was starting, plus any given on
/// the command line (how Windows passes the file that was double-clicked).
pub fn finish_launching(app: &AppHandle, args: Vec<String>) {
    let docs = documents(app);
    docs.launched.store(true, Ordering::SeqCst);
    let mut paths = docs
        .queued
        .lock()
        .map(|mut q| std::mem::take(&mut *q))
        .unwrap_or_default();
    paths.extend(paths_from_args(args, std::env::current_dir().ok()));
    open_external(app, paths);
}

/// File paths among command-line arguments (without the program), made absolute.
pub fn paths_from_args(
    args: impl IntoIterator<Item = String>,
    cwd: Option<std::path::PathBuf>,
) -> Vec<String> {
    args.into_iter()
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| match &cwd {
            Some(cwd) => cwd.join(&arg).to_string_lossy().into_owned(),
            None => arg,
        })
        .collect()
}

fn open_into_blank(app: &AppHandle, path: String) -> Result<(), String> {
    let docs = documents(app);
    // Held throughout, so a blank window can't mount and take its (empty)
    // initial document between being chosen and being given the file.
    let ready = docs.ready.lock().map_err(|e| e.to_string())?;
    let blank = blank_window(app, &docs)?;
    let Some(text) = open_path(app, path.clone(), blank.as_ref())? else {
        return Ok(());
    };
    let Some(window) = blank else {
        return Ok(());
    };
    let label = window.label().to_string();
    if ready.contains(&label) {
        app.emit_to(
            EventTarget::webview_window(&label),
            "load-document",
            InitialDocument { path, text },
        )
        .map_err(|e| e.to_string())
    } else {
        docs.pending
            .lock()
            .map_err(|e| e.to_string())?
            .insert(label, text);
        Ok(())
    }
}

/// An untitled window without changes or a document on its way, preferring the focused one.
fn blank_window(app: &AppHandle, docs: &Documents) -> Result<Option<WebviewWindow>, String> {
    let paths = docs.paths.lock().map_err(|e| e.to_string())?;
    let pending = docs.pending.lock().map_err(|e| e.to_string())?;
    let edited = docs.edited.lock().map_err(|e| e.to_string())?;
    let mut blank: Vec<WebviewWindow> = app
        .webview_windows()
        .into_values()
        .filter(|w| {
            let label = w.label();
            paths.get(label).is_none_or(|p| p.is_none())
                && !pending.contains_key(label)
                && !edited.contains(label)
        })
        .collect();
    blank.sort_by_key(|w| !w.is_focused().unwrap_or(false));
    Ok(blank.into_iter().next())
}

fn show_error(app: &AppHandle, message: String) {
    app.dialog()
        .message(message)
        .title("Writer")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
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
        show_error(app, e);
    }
}

/// Starts quitting: each window is asked to close in turn (see `window_destroyed`).
pub fn quit(app: &AppHandle) {
    // Already under way (e.g. Dock Quit while a window asks): let it continue.
    if !documents(app).quitting.swap(true, Ordering::SeqCst) {
        close_next(app);
    }
}

fn close_next(app: &AppHandle) {
    match focused_window(app).or_else(|| app.webview_windows().into_values().next()) {
        // Goes through the frontend's close handler, which may cancel.
        Some(window) => {
            let _ = window.close();
        }
        // A system quit request (Dock, logout) is answered; AppKit then terminates.
        None if crate::terminate::pending() => crate::terminate::reply(true),
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
    // While a system quit request waits, `close_next` answers it instead.
    cfg!(target_os = "macos")
        && (!documents(app).quitting.load(Ordering::SeqCst) || crate::terminate::pending())
}

/// Sends a menu command to the focused window only; every window listens.
pub fn emit_to_focused<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) -> bool {
    let Some(window) = focused_window(app) else {
        return false;
    };
    app.emit_to(EventTarget::webview_window(window.label()), event, payload)
        .is_ok()
}

/// The document Rust read for this window before it existed, if any. The page
/// calls this once its listeners are in place; later documents for this window
/// come as `load-document` events.
#[tauri::command]
pub fn take_initial_document(
    window: WebviewWindow,
    docs: tauri::State<'_, Documents>,
) -> Result<Option<InitialDocument>, String> {
    let label = window.label();
    let mut ready = docs.ready.lock().map_err(|e| e.to_string())?;
    ready.insert(label.to_string());
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
    crate::terminate::reply(false);
}

/// Shows unsaved changes as the dot in the macOS close button.
#[tauri::command]
pub fn set_document_edited(
    window: WebviewWindow,
    docs: tauri::State<'_, Documents>,
    edited: bool,
) -> Result<(), String> {
    if let Ok(mut set) = docs.edited.lock() {
        if edited {
            set.insert(window.label().to_string());
        } else {
            set.remove(window.label());
        }
    }
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        window
            .run_on_main_thread(move || {
                if let Ok(ns_window) = target.ns_window() {
                    // Safety: on the main thread, with the window alive (`target` holds it).
                    let ns_window = unsafe { &*(ns_window as *const objc2_app_kit::NSWindow) };
                    ns_window.setDocumentEdited(edited);
                }
            })
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Windows shows it in the title instead (`*name - Writer`).
        let _ = (window, edited);
        Ok(())
    }
}
