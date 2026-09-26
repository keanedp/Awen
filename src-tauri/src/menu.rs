use std::collections::HashMap;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
use tauri::{AppHandle, Manager, Runtime};

/// Menu item ids that are forwarded to the focused window as `menu` events.
/// New, Quit, Settings and (with no document focused) Open are handled in Rust.
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
    "word_count",
    "code_highlighting",
    "text_bigger",
    "text_smaller",
    "text_actual",
    "export",
    "print",
    "format_heading_1",
    "format_heading_2",
    "format_heading_3",
    "format_heading_4",
    "format_heading_5",
    "format_heading_6",
    "format_bulleted",
    "format_numbered",
    "format_task",
    "format_quote",
    "format_body",
    "format_bold",
    "format_italic",
    "format_strikethrough",
    "format_highlight",
    "format_code",
    "format_code_block",
    "format_link",
    "format_rule",
    "format_clear",
];

/// Items with a checkmark, by id, kept so the frontend can sync them
/// (`Menu::get` only searches top-level items).
pub struct CheckItems<R: Runtime>(pub HashMap<&'static str, CheckMenuItem<R>>);

impl<R: Runtime> CheckItems<R> {
    /// Undoes the checkmark a click toggled, when no window owns its state.
    pub fn untoggle(&self, id: &str) {
        if let Some(item) = self.0.get(id) {
            if let Ok(checked) = item.is_checked() {
                let _ = item.set_checked(!checked);
            }
        }
    }
}

/// The Format menu's items, kept so they can be disabled while the focused
/// window can't be edited (preview, a locked document, Settings).
pub struct FormatItems<R: Runtime>(pub Vec<MenuItem<R>>);

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
            // On macOS, Settings… lives in the app menu instead.
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &item("settings", "Settings…", "CmdOrCtrl+,")?,
        ],
    )?;

    // focused editors' Format menu (W-060), with its shortcuts. Blockquote's ⌘> is
    // set natively on macOS (`use_character_shortcuts`); elsewhere it's Ctrl+Shift+.
    let mut format_items = Vec::new();
    let mut format_item = |id: &str, text: &str, accel: Option<&str>| {
        let item = MenuItem::with_id(app, id, text, true, accel)?;
        format_items.push(item.clone());
        tauri::Result::Ok(item)
    };
    let headings = (1..=6)
        .map(|n| {
            format_item(
                &format!("format_heading_{n}"),
                &format!("Heading {n}"),
                Some(&format!("CmdOrCtrl+{n}")),
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let headings = Submenu::with_items(
        app,
        "Headings",
        true,
        &headings
            .iter()
            .map(|item| item as &dyn tauri::menu::IsMenuItem<R>)
            .collect::<Vec<_>>(),
    )?;
    let lists = Submenu::with_items(
        app,
        "Lists",
        true,
        &[
            &format_item("format_bulleted", "Bulleted List", None)?,
            &format_item("format_numbered", "Numbered List", None)?,
            &format_item("format_task", "Task List", None)?,
        ],
    )?;
    let blockquote = format_item("format_quote", "Blockquote", Some("CmdOrCtrl+Shift+."))?;
    let body = format_item("format_body", "Body", None)?;
    let bold = format_item("format_bold", "Bold", Some("CmdOrCtrl+B"))?;
    let italic = format_item("format_italic", "Italic", Some("CmdOrCtrl+I"))?;
    let strikethrough = format_item(
        "format_strikethrough",
        "Strikethrough",
        Some("CmdOrCtrl+Alt+U"),
    )?;
    let highlight = format_item("format_highlight", "Highlight", Some("CmdOrCtrl+Shift+U"))?;
    let code = format_item("format_code", "Code", Some("CmdOrCtrl+J"))?;
    let code_block = format_item("format_code_block", "Code Block", Some("CmdOrCtrl+Shift+J"))?;
    let link = format_item("format_link", "Add Link", Some("CmdOrCtrl+K"))?;
    let rule = format_item("format_rule", "Add Horizontal Rule", None)?;
    let clear = format_item(
        "format_clear",
        "Clear Styles",
        Some("CmdOrCtrl+Alt+Backspace"),
    )?;
    let format = Submenu::with_items(
        app,
        "Format",
        true,
        &[
            &headings,
            &lists,
            &blockquote,
            &body,
            &PredefinedMenuItem::separator(app)?,
            &bold,
            &italic,
            &strikethrough,
            &highlight,
            &PredefinedMenuItem::separator(app)?,
            &code,
            &code_block,
            &PredefinedMenuItem::separator(app)?,
            &link,
            &PredefinedMenuItem::separator(app)?,
            &rule,
            &PredefinedMenuItem::separator(app)?,
            &clear,
        ],
    )?;
    app.manage(FormatItems(format_items));

    let preview =
        CheckMenuItem::with_id(app, "preview", "Preview", true, false, Some("CmdOrCtrl+R"))?;
    let word_count =
        CheckMenuItem::with_id(app, "word_count", "Word Count", true, false, None::<&str>)?;
    let code_highlighting = CheckMenuItem::with_id(
        app,
        "code_highlighting",
        "Code Highlighting",
        true,
        false,
        None::<&str>,
    )?;
    app.manage(CheckItems(HashMap::from([
        ("preview", preview.clone()),
        ("word_count", word_count.clone()),
        ("code_highlighting", code_highlighting.clone()),
    ])));

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &preview,
            &PredefinedMenuItem::separator(app)?,
            // The text size preference, also set in Settings.
            &item("text_bigger", "Bigger", "CmdOrCtrl+=")?,
            &item("text_smaller", "Smaller", "CmdOrCtrl+-")?,
            &item("text_actual", "Actual Size", "CmdOrCtrl+0")?,
            &PredefinedMenuItem::separator(app)?,
            &word_count,
            &code_highlighting,
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
            "Awen",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("About Awen"), None)?,
                &PredefinedMenuItem::separator(app)?,
                &item("settings", "Settings…", "CmdOrCtrl+,")?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::show_all(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                // Custom quit so the frontend can prompt about unsaved changes.
                &item("quit", "Quit Awen", "CmdOrCtrl+Q")?,
            ],
        )?;
        Menu::with_items(app, &[&app_menu, &file, &edit, &format, &view, &window])
    }

    #[cfg(not(target_os = "macos"))]
    Menu::with_items(app, &[&file, &edit, &format, &view, &window])
}

/// Gives macOS menu items a shortcut that is a typed character rather than a
/// key: Blockquote shows ⌘> and follows the `>` key on any keyboard layout, as
/// in focused editors. Tauri's accelerators name physical keys, so the closest it
/// can do is ⇧⌘. . Call after the menu is built (it is before `setup`).
#[cfg(target_os = "macos")]
pub fn use_character_shortcuts() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSEventModifierFlags, NSMenu};
    use objc2_foundation::NSString;

    /// The item titled `path[last]` in the submenus titled `path[..last]`.
    fn find(
        menu: &NSMenu,
        path: &[&str],
    ) -> Option<objc2::rc::Retained<objc2_app_kit::NSMenuItem>> {
        let item = menu.itemWithTitle(&NSString::from_str(path[0]))?;
        match path {
            [_] => Some(item),
            [_, rest @ ..] => find(&*item.submenu()?, rest),
            [] => None,
        }
    }

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let Some(menu) = NSApplication::sharedApplication(mtm).mainMenu() else {
        return;
    };
    if let Some(item) = find(&menu, &["Format", "Blockquote"]) {
        item.setKeyEquivalent(&NSString::from_str(">"));
        item.setKeyEquivalentModifierMask(NSEventModifierFlags::Command);
    }
}
