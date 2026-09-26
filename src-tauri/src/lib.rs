mod export;
mod menu;
mod recent;

use tauri::{Emitter, Manager};

#[tauri::command]
fn read_document(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Could not open {path}: {e}"))
}

#[tauri::command]
fn write_document(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not save {path}: {e}"))
}

#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| format!("Could not print: {e}"))
}

/// The frontend owns preview state; this keeps the menu checkmark in step with it.
#[tauri::command]
fn set_preview_checked(
    item: tauri::State<'_, menu::PreviewMenuItem<tauri::Wry>>,
    checked: bool,
) -> Result<(), String> {
    item.0.set_checked(checked).map_err(|e| e.to_string())
}

/// Puts a document at the top of File → Open Recent.
#[tauri::command]
fn note_recent_document(
    app: tauri::AppHandle,
    recent: tauri::State<'_, recent::Recent<tauri::Wry>>,
    path: String,
) -> Result<(), String> {
    recent.note(&app, path)
}

/// Removes a document from File → Open Recent, e.g. one that no longer exists.
#[tauri::command]
fn forget_recent_document(
    app: tauri::AppHandle,
    recent: tauri::State<'_, recent::Recent<tauri::Wry>>,
    path: String,
) -> Result<(), String> {
    recent.forget(&app, &path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .menu(menu::build)
        .setup(|app| Ok(recent::load(app.handle())?))
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if menu::FORWARDED.contains(&id) {
                let _ = app.emit("menu", id);
            } else if let Some(path) = id.strip_prefix(recent::OPEN_PREFIX) {
                let _ = app.emit("open-recent", path);
            } else if id == recent::CLEAR_ID {
                let _ = app.state::<recent::Recent<tauri::Wry>>().clear(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_document,
            print_page,
            set_preview_checked,
            note_recent_document,
            forget_recent_document,
            export::choose_export,
            export::export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
