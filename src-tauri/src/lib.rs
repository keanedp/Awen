mod documents;
mod export;
mod menu;
mod recent;
mod terminate;

use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // Later windows cascade from the focused one instead.
                .with_filter(|label| label == documents::MAIN)
                .build(),
        )
        .manage(documents::Documents::default())
        .menu(menu::build)
        .setup(|app| {
            terminate::install(app.handle());
            Ok(recent::load(app.handle())?)
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "new" => {
                    let _ = documents::new_window(app, None);
                }
                "quit" => documents::quit(app),
                // With no window to ask, Rust shows the Open dialog itself.
                "open" if !documents::emit_to_focused(app, "menu", id) => {
                    documents::open_without_window(app, None)
                }
                recent::CLEAR_ID => {
                    let _ = app.state::<recent::Recent<tauri::Wry>>().clear(app);
                }
                _ if menu::FORWARDED.contains(&id) => {
                    documents::emit_to_focused(app, "menu", id);
                }
                _ => {
                    if let Some(path) = id.strip_prefix(recent::OPEN_PREFIX) {
                        if !documents::emit_to_focused(app, "open-recent", path) {
                            documents::open_without_window(app, Some(path.to_string()));
                        }
                    }
                }
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                documents::window_destroyed(window.app_handle(), window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            write_document,
            print_page,
            set_preview_checked,
            note_recent_document,
            documents::take_initial_document,
            documents::open_document,
            documents::set_document_path,
            documents::cancel_quit,
            documents::set_document_edited,
            export::choose_export,
            export::export_pdf
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Mac apps keep running with no windows open, until Quit.
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } if documents::keep_running(app) => api.prevent_exit(),
            // Clicking the Dock icon with no windows open starts a new document.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } if app.webview_windows().is_empty() => {
                let _ = documents::new_window(app, None);
            }
            _ => {}
        });
}
