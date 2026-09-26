mod accent;
mod documents;
mod export;
mod menu;
mod preferences;
mod recent;
mod rename;
mod settings;
mod spelling;
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

/// The frontend owns preview and view settings; this keeps a menu checkmark in step with them.
#[tauri::command]
fn set_menu_checked(
    items: tauri::State<'_, menu::CheckItems<tauri::Wry>>,
    id: String,
    checked: bool,
) -> Result<(), String> {
    let item = items
        .0
        .get(id.as_str())
        .ok_or(format!("No menu item {id}"))?;
    item.set_checked(checked).map_err(|e| e.to_string())
}

/// Enables the Format menu while the focused window's document can be edited.
#[tauri::command]
fn set_format_enabled(
    items: tauri::State<'_, menu::FormatItems<tauri::Wry>>,
    enabled: bool,
) -> Result<(), String> {
    for item in &items.0 {
        item.set_enabled(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    let builder = tauri::Builder::default();
    // Windows starts a new process for each file opened from Explorer; this
    // hands its arguments to the running app and exits. Registered first, so
    // the second process stops before doing anything else.
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let paths = documents::paths_from_args(args.into_iter().skip(1), Some(cwd.into()));
        documents::open_external(app, paths);
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // Later windows cascade from the focused one instead.
                .with_filter(|label| label == documents::MAIN)
                .build(),
        )
        .manage(documents::Documents::default())
        .manage(preferences::Preferences::default())
        .menu(menu::build)
        .setup(|app| {
            terminate::install(app.handle());
            #[cfg(target_os = "macos")]
            menu::use_character_shortcuts();
            recent::load(app.handle())?;
            preferences::load(app.handle())?;
            // macOS passes files as `Opened` events instead of arguments.
            let args = if cfg!(target_os = "macos") {
                Vec::new()
            } else {
                std::env::args().skip(1).collect()
            };
            documents::finish_launching(app.handle(), args);
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "new" => {
                    let _ = documents::new_window(app, None);
                }
                "quit" => documents::quit(app),
                "settings" => settings::show(app),
                // With no document to ask, Rust shows the Open dialog itself.
                "open" if !documents::emit_to_focused_document(app, "menu", id) => {
                    documents::open_without_window(app, None)
                }
                // Sent by the guard above; don't fall through to FORWARDED and send it twice.
                "open" => {}
                // Preview belongs to a document; Settings can't restate it.
                "preview" if settings::is_focused(app) => {
                    app.state::<menu::CheckItems<tauri::Wry>>().untoggle(id)
                }
                recent::CLEAR_ID => {
                    let _ = app.state::<recent::Recent<tauri::Wry>>().clear(app);
                }
                _ if menu::FORWARDED.contains(&id) => {
                    documents::emit_to_focused(app, "menu", id);
                }
                _ => {
                    if let Some(path) = id.strip_prefix(recent::OPEN_PREFIX) {
                        if !documents::emit_to_focused_document(app, "open-recent", path) {
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
            set_menu_checked,
            set_format_enabled,
            preferences::preferences,
            preferences::set_preference,
            note_recent_document,
            documents::take_initial_document,
            documents::open_document,
            documents::set_document_path,
            documents::cancel_quit,
            documents::set_document_edited,
            export::choose_export,
            export::export_pdf,
            rename::show_document_info,
            rename::move_document,
            rename::create_document,
            rename::set_file_tags,
            rename::set_file_locked,
            rename::is_file_locked,
            documents::duplicate_document,
            accent::accent_colors,
            spelling::check_spelling,
            spelling::spelling_guesses,
            spelling::learn_spelling,
            spelling::ignore_spelling
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Mac apps keep running with no windows open, until Quit.
            tauri::RunEvent::ExitRequested {
                code: None, api, ..
            } if documents::keep_running(app) => api.prevent_exit(),
            // Clicking the Dock icon with no windows open starts a new document.
            // Files opened from Finder, or dropped on the Dock icon.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                let paths = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect();
                documents::open_external(app, paths);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } if !documents::any_open(app) => {
                let _ = documents::new_window(app, None);
            }
            _ => {}
        });
}
