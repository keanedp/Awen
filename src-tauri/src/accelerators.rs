//! WebView2 receives keyboard input in its own process, outside Tao's message
//! loop. Forward app shortcuts through the same dispatch as native menu clicks.

#[derive(Clone, Copy, Debug, PartialEq)]
#[cfg(any(windows, test))]
pub struct Shortcut {
    key: u32,
    control: bool,
    shift: bool,
    alt: bool,
}

#[cfg(any(windows, test))]
impl Shortcut {
    pub fn parse(value: &str) -> Option<Self> {
        let mut shortcut = Self {
            key: 0,
            control: false,
            shift: false,
            alt: false,
        };
        for part in value.split('+') {
            match part {
                "CmdOrCtrl" | "Ctrl" => shortcut.control = true,
                "Shift" => shortcut.shift = true,
                "Alt" => shortcut.alt = true,
                key if shortcut.key == 0 => {
                    shortcut.key = match key {
                        "Backspace" => 0x08,
                        "F3" => 0x72,
                        "," => 0xbc,
                        "." => 0xbe,
                        "=" => 0xbb,
                        "-" => 0xbd,
                        key if key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric() => {
                            key.as_bytes()[0].to_ascii_uppercase() as u32
                        }
                        _ => return None,
                    }
                }
                _ => return None,
            }
        }
        (shortcut.key != 0).then_some(shortcut)
    }

    pub fn matches(self, key: u32, control: bool, shift: bool, alt: bool) -> bool {
        self == Self {
            key,
            control,
            shift,
            alt,
        }
    }

    pub fn matches_input(
        self,
        key: u32,
        control: bool,
        shift: bool,
        alt: bool,
        right_alt: bool,
    ) -> bool {
        // Windows represents AltGr as Ctrl+Right Alt. Let it enter text instead
        // of invoking a Ctrl+Alt formatting command.
        !(control && right_alt) && self.matches(key, control, shift, alt)
    }
}

#[cfg(any(windows, test))]
fn should_dispatch(enabled: bool, check_item: bool, repeated: bool) -> bool {
    enabled && !(check_item && repeated)
}

#[cfg(windows)]
mod win32 {
    use super::{should_dispatch, Shortcut};
    use std::sync::Mutex;
    use tauri::{menu::MenuItemKind, Manager, Runtime, WebviewWindow};
    use webview2_com::{
        AcceleratorKeyPressedEventHandler,
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
            COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
        },
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetKeyState, VK_CONTROL, VK_MENU, VK_RMENU, VK_SHIFT,
    };

    pub struct Shortcuts<R: Runtime>(pub Mutex<Vec<(Shortcut, MenuItemKind<R>)>>);

    impl<R: Runtime> Default for Shortcuts<R> {
        fn default() -> Self {
            Self(Mutex::new(Vec::new()))
        }
    }

    pub fn record<R: Runtime>(
        app: &tauri::AppHandle<R>,
        item: MenuItemKind<R>,
        accelerator: &str,
    ) -> tauri::Result<()> {
        let shortcut = Shortcut::parse(accelerator).ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("Unsupported app shortcut: {accelerator}"),
            )
        })?;
        app.state::<Shortcuts<R>>()
            .0
            .lock()
            .unwrap()
            .push((shortcut, item));
        Ok(())
    }

    pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
        let app = window.app_handle().clone();
        let target = window.clone();
        window.with_webview(move |webview| {
            let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                unsafe {
                    let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
                    args.KeyEventKind(&mut kind)?;
                    if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                        && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
                    {
                        return Ok(());
                    }
                    let mut key = 0;
                    args.VirtualKey(&mut key)?;
                    let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                    args.PhysicalKeyStatus(&mut status)?;
                    let down = |key| GetKeyState(key as i32) < 0;
                    let shortcuts = app.state::<Shortcuts<tauri::Wry>>();
                    let matched =
                        shortcuts
                            .0
                            .lock()
                            .unwrap()
                            .iter()
                            .find_map(|(shortcut, item)| {
                                if !shortcut.matches_input(
                                    key,
                                    down(VK_CONTROL),
                                    down(VK_SHIFT),
                                    down(VK_MENU),
                                    down(VK_RMENU),
                                ) {
                                    return None;
                                }
                                let enabled = match item {
                                    MenuItemKind::MenuItem(item) => item.is_enabled(),
                                    MenuItemKind::Check(item) => item.is_enabled(),
                                    _ => return None,
                                }
                                .unwrap_or(false);
                                let dispatch = should_dispatch(
                                    enabled,
                                    matches!(item, MenuItemKind::Check(_)),
                                    status.WasKeyDown.as_bool(),
                                );
                                let check = match item {
                                    MenuItemKind::Check(item) => Some(item.clone()),
                                    _ => None,
                                };
                                Some((item.id().as_ref().to_owned(), dispatch, check))
                            });
                    if let Some((id, dispatch, check)) = matched {
                        args.SetHandled(true)?;
                        if !dispatch {
                            return Ok(());
                        }
                        let handle = app.clone();
                        let target = target.clone();
                        // Creating windows or showing dialogs inside this synchronous
                        // WebView2 callback reenters COM. Dispatch after it returns.
                        // run_on_main_thread executes inline when already on that
                        // thread, so first leave the COM callback on the worker pool.
                        tauri::async_runtime::spawn(async move {
                            let queued = handle.clone();
                            let _ = handle.run_on_main_thread(move || {
                                if !target.is_focused().unwrap_or(false) {
                                    return;
                                }
                                if let Some(item) = check {
                                    if let Ok(checked) = item.is_checked() {
                                        let _ = item.set_checked(!checked);
                                    }
                                }
                                crate::menu::dispatch(&queued, &id);
                            });
                        });
                    }
                }
                Ok(())
            }));
            unsafe {
                let mut token = 0;
                if let Err(error) = webview
                    .controller()
                    .add_AcceleratorKeyPressed(&handler, &mut token)
                {
                    eprintln!("Could not install app shortcuts: {error}");
                }
            }
        })
    }
}

#[cfg(windows)]
pub use win32::{install, record, Shortcuts};

#[cfg(test)]
mod tests {
    use super::{should_dispatch, Shortcut};

    #[test]
    fn altgr_is_left_to_the_editor() {
        let shortcut = Shortcut::parse("Ctrl+Alt+K").unwrap();
        assert!(shortcut.matches_input(0x4b, true, false, true, false));
        assert!(!shortcut.matches_input(0x4b, true, false, true, true));
    }

    #[test]
    fn disabled_commands_do_not_dispatch_and_check_items_toggle_once_per_press() {
        assert!(!should_dispatch(false, false, false));
        assert!(!should_dispatch(false, true, false));
        assert!(should_dispatch(true, true, false));
        assert!(!should_dispatch(true, true, true));
        assert!(should_dispatch(true, false, true));
    }

    #[test]
    fn shortcuts_require_the_exact_modifiers() {
        let shortcut = Shortcut::parse("CmdOrCtrl+D").unwrap();
        assert!(shortcut.matches(0x44, true, false, false));
        assert!(!shortcut.matches(0x44, true, true, false));
        assert!(!shortcut.matches(0x44, true, false, true));
        assert!(!shortcut.matches(0x44, false, false, false));
        assert!(!shortcut.matches(0x46, true, false, false));
    }

    #[test]
    fn named_keys_and_physical_punctuation_match_windows_virtual_keys() {
        for (text, key, control, shift, alt) in [
            ("F3", 0x72, false, false, false),
            ("Shift+F3", 0x72, false, true, false),
            ("CmdOrCtrl+Alt+Backspace", 8, true, false, true),
            ("CmdOrCtrl+Shift+.", 0xbe, true, true, false),
            ("CmdOrCtrl+,", 0xbc, true, false, false),
            ("CmdOrCtrl+=", 0xbb, true, false, false),
            ("CmdOrCtrl+-", 0xbd, true, false, false),
            ("Ctrl+Alt+K", 0x4b, true, false, true),
        ] {
            assert!(
                Shortcut::parse(text)
                    .unwrap()
                    .matches(key, control, shift, alt),
                "{text}"
            );
        }
    }

    #[test]
    fn missing_or_multiple_keys_are_rejected() {
        for text in ["", "Ctrl", "Ctrl+Unknown", "Ctrl+A+B"] {
            assert!(Shortcut::parse(text).is_none(), "{text}");
        }
    }
}
