use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

/// Menu item ids that are forwarded to the frontend as `menu` events.
pub const FORWARDED: &[&str] = &[
    "new", "open", "save", "save_as", "close", "quit", "undo", "redo",
];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str, accel: &str| {
        MenuItem::with_id(app, id, text, true, Some(accel))
    };

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("new", "New", "CmdOrCtrl+N")?,
            &item("open", "Open…", "CmdOrCtrl+O")?,
            &PredefinedMenuItem::separator(app)?,
            &item("save", "Save", "CmdOrCtrl+S")?,
            &item("save_as", "Save As…", "CmdOrCtrl+Shift+S")?,
            &PredefinedMenuItem::separator(app)?,
            &item("close", "Close", "CmdOrCtrl+W")?,
            // On macOS, Quit lives in the app menu instead.
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            // Undo/redo go to the editor's own history; native accelerators
            // would otherwise swallow the keystroke before CodeMirror sees it.
            &item("undo", "Undo", "CmdOrCtrl+Z")?,
            &item("redo", "Redo", "CmdOrCtrl+Shift+Z")?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app, None)?],
    )?;

    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "Writer",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("About Writer"), None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                // Custom quit so the frontend can prompt about unsaved changes.
                &item("quit", "Quit Writer", "CmdOrCtrl+Q")?,
            ],
        )?;
        Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
    }

    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file, &edit, &view, &window])
}
