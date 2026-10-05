use std::collections::HashMap;

use crate::{documents, recent, settings, updates};
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
    "focus_mode",
    "focus_sentence",
    "focus_paragraph",
    "focus_typewriter",
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
    "format_footnote",
    "format_table",
    "format_page_break",
    "format_date",
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
    #[cfg(windows)]
    app.manage(crate::accelerators::Shortcuts::<R>::default());
    let item = |id: &str, text: &str, accel: &str| {
        let item = MenuItem::with_id(app, id, text, true, Some(accel))?;
        #[cfg(windows)]
        crate::accelerators::record(
            app,
            tauri::menu::MenuItemKind::MenuItem(item.clone()),
            accel,
        )?;
        tauri::Result::Ok(item)
    };

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

    // The Format menu (W-060), with its shortcuts. Blockquote's ⌘> is
    // set natively on macOS (`use_character_shortcuts`); elsewhere it's Ctrl+Shift+.
    let mut format_items = Vec::new();
    let mut format_item = |id: &str, text: &str, accel: Option<&str>| {
        let item = MenuItem::with_id(app, id, text, true, accel)?;
        #[cfg(windows)]
        if let Some(accel) = accel {
            crate::accelerators::record(
                app,
                tauri::menu::MenuItemKind::MenuItem(item.clone()),
                accel,
            )?;
        }
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
    // ⌃⌘K on macOS; Ctrl+Alt+K elsewhere, where Ctrl+Ctrl would be one key.
    let footnote_accel = if cfg!(target_os = "macos") {
        "Ctrl+Cmd+K"
    } else {
        "Ctrl+Alt+K"
    };
    let footnote = format_item("format_footnote", "Add Footnote", Some(footnote_accel))?;
    let table = format_item("format_table", "Add Table", None)?;
    let page_break = format_item("format_page_break", "Add Page Break", None)?;
    let date = format_item("format_date", "Add Date", None)?;
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
            &footnote,
            &PredefinedMenuItem::separator(app)?,
            &rule,
            &page_break,
            &PredefinedMenuItem::separator(app)?,
            &date,
            &table,
            &PredefinedMenuItem::separator(app)?,
            &clear,
        ],
    )?;
    app.manage(FormatItems(format_items));

    let preview =
        CheckMenuItem::with_id(app, "preview", "Preview", true, false, Some("CmdOrCtrl+R"))?;
    let focus_mode = CheckMenuItem::with_id(
        app,
        "focus_mode",
        "Focus Mode",
        true,
        false,
        Some("CmdOrCtrl+D"),
    )?;
    #[cfg(windows)]
    {
        crate::accelerators::record(
            app,
            tauri::menu::MenuItemKind::Check(preview.clone()),
            "CmdOrCtrl+R",
        )?;
        crate::accelerators::record(
            app,
            tauri::menu::MenuItemKind::Check(focus_mode.clone()),
            "CmdOrCtrl+D",
        )?;
    }
    let focus_sentence =
        CheckMenuItem::with_id(app, "focus_sentence", "Sentence", true, false, None::<&str>)?;
    let focus_paragraph = CheckMenuItem::with_id(
        app,
        "focus_paragraph",
        "Paragraph",
        true,
        false,
        None::<&str>,
    )?;
    let focus_typewriter = CheckMenuItem::with_id(
        app,
        "focus_typewriter",
        "Typewriter",
        true,
        false,
        None::<&str>,
    )?;
    let focus_unit = Submenu::with_items(
        app,
        "Focus On",
        true,
        &[&focus_sentence, &focus_paragraph, &focus_typewriter],
    )?;
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
        ("focus_mode", focus_mode.clone()),
        ("focus_sentence", focus_sentence.clone()),
        ("focus_paragraph", focus_paragraph.clone()),
        ("focus_typewriter", focus_typewriter.clone()),
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
            &focus_mode,
            &focus_unit,
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

    // In the app menu on macOS, and a Help menu elsewhere, as in most apps.
    let check_updates = MenuItem::with_id(
        app,
        "check_updates",
        "Check for Updates…",
        true,
        None::<&str>,
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "Awen",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("About Awen"), None)?,
                &check_updates,
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
    {
        let help = Submenu::with_items(app, "Help", true, &[&check_updates])?;
        Menu::with_items(app, &[&file, &edit, &format, &view, &window, &help])
    }
}

/// Gives macOS menu items a shortcut that is a typed character rather than a
/// key: Blockquote shows ⌘> and follows the `>` key on any keyboard layout.
/// Tauri's accelerators name physical keys, so the closest it can do is ⇧⌘. . Call after the menu is built (it is before `setup`).
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
pub fn dispatch(app: &AppHandle, id: &str) {
    match id {
        "new" => {
            let _ = documents::new_window(app, None);
        }
        "quit" => documents::quit(app),
        "settings" => settings::show(app),
        "check_updates" => updates::check_now(app),
        // With no document to ask, Rust shows the Open dialog itself.
        "open" if !documents::emit_to_focused_document(app, "menu", id) => {
            documents::open_without_window(app, None)
        }
        // Sent by the guard above; don't fall through to FORWARDED and send it twice.
        "open" => {}
        // Preview belongs to a document; Settings can't restate it.
        "preview" if settings::is_focused(app) => {
            app.state::<CheckItems<tauri::Wry>>().untoggle(id)
        }
        recent::CLEAR_ID => {
            let _ = app.state::<recent::Recent<tauri::Wry>>().clear(app);
        }
        _ if FORWARDED.contains(&id) => {
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
}
