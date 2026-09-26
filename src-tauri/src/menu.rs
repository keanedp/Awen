use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Manager, Runtime};

/// Menu item ids that are forwarded to the focused window as `menu` events.
/// New, Quit and (with no window open) Open are handled in Rust.
pub const FORWARDED: &[&str] = &[
    "open",
    "save",
    "save_as",
    "rename",
    "close",
    "undo",
    "redo",
    "find",
    "find_replace",
    "find_next",
    "find_previous",
    "find_selection",
    "preview",
    "export",
    "print",
];

/// View → Preview, kept so the frontend can sync its checkmark
/// (`Menu::get` only searches top-level items).
pub struct PreviewMenuItem<R: Runtime>(pub CheckMenuItem<R>);

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item =
        |id: &str, text: &str, accel: &str| MenuItem::with_id(app, id, text, true, Some(accel));

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &item("new", "New", "CmdOrCtrl+N")?,
            &item("open", "Open…", "CmdOrCtrl+O")?,
            &crate::recent::build(app)?,
            &PredefinedMenuItem::separator(app)?,
            &item("save", "Save", "CmdOrCtrl+S")?,
            &item("save_as", "Save As…", "CmdOrCtrl+Shift+S")?,
            // Opens the title popover (Name, Tags, Where), as in NSDocument apps.
            #[cfg(target_os = "macos")]
            &MenuItem::with_id(app, "rename", "Rename…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &item("export", "Export…", "CmdOrCtrl+Shift+E")?,
            &item("print", "Print…", "CmdOrCtrl+P")?,
            &PredefinedMenuItem::separator(app)?,
            &item("close", "Close", "CmdOrCtrl+W")?,
            // On macOS, Quit lives in the app menu instead.
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?,
        ],
    )?;

    // macOS groups these in an Edit → Find submenu; Windows lists them in Edit
    // with Notepad's shortcuts (F3, and Ctrl+H, since Cmd+H hides apps on macOS).
    #[cfg(target_os = "macos")]
    let find = Submenu::with_items(
        app,
        "Find",
        true,
        &[
            &item("find", "Find…", "CmdOrCtrl+F")?,
            &item("find_replace", "Find and Replace…", "CmdOrCtrl+Alt+F")?,
            &item("find_next", "Find Next", "CmdOrCtrl+G")?,
            &item("find_previous", "Find Previous", "CmdOrCtrl+Shift+G")?,
            &item("find_selection", "Use Selection for Find", "CmdOrCtrl+E")?,
        ],
    )?;
    #[cfg(not(target_os = "macos"))]
    let find = [
        item("find", "Find…", "CmdOrCtrl+F")?,
        item("find_next", "Find Next", "F3")?,
        item("find_previous", "Find Previous", "Shift+F3")?,
        item("find_replace", "Replace…", "CmdOrCtrl+H")?,
    ];

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
            &PredefinedMenuItem::separator(app)?,
            #[cfg(target_os = "macos")]
            &find,
            #[cfg(not(target_os = "macos"))]
            &find[0],
            #[cfg(not(target_os = "macos"))]
            &find[1],
            #[cfg(not(target_os = "macos"))]
            &find[2],
            #[cfg(not(target_os = "macos"))]
            &find[3],
        ],
    )?;

    let preview =
        CheckMenuItem::with_id(app, "preview", "Preview", true, false, Some("CmdOrCtrl+R"))?;
    app.manage(PreviewMenuItem(preview.clone()));

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &preview,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    // This id makes it the macOS Window menu, which lists the open windows.
    let window = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
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
