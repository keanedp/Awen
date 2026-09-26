mod export;
mod menu;

use tauri::Emitter;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .menu(menu::build)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if menu::FORWARDED.contains(&id) {
                let _ = app.emit("menu", id);
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_document,
            print_page,
            set_preview_checked,
            export::choose_export,
            export::export_pdf
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
