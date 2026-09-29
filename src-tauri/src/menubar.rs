//! The Windows menu bar (W-073). Document windows have no native frame,
//! so there's no Win32 menu bar either. The title bar draws the menu titles,
//! and `track_menu_bar` opens the app menu's submenus as native popups.
//!
//! A popup has no neighbors, so this does what a menu bar's own loop would:
//! while a popup is open, a message filter hook watches for the pointer moving
//! onto another title and for Left/Right at the edge of the menu. It then
//! closes the popup (`EndMenu`) and opens the neighbor, like WTL's CommandBar.

use serde::Deserialize;

/// A menu title's box in the web view, in CSS pixels.
#[derive(Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct Title {
    name: String,
    left: f64,
    top: f64,
    right: f64,
    bottom: f64,
}

/// What an arrow key does while a popup is open.
#[derive(Debug, PartialEq)]
#[cfg_attr(not(windows), allow(dead_code))]
enum Arrow {
    /// Leave it to the menu: close or open a submenu, or move the selection.
    Native,
    /// Close this popup and open the one at this index.
    Switch(usize),
}

/// Left in the popup itself (not in a submenu) moves to the previous menu;
/// Right on an item without a submenu moves to the next. Both wrap around.
#[cfg_attr(not(windows), allow(dead_code))]
fn arrow(left: bool, current: usize, count: usize, in_top: bool, on_submenu: bool) -> Arrow {
    match left {
        true if in_top => Arrow::Switch((current + count - 1) % count),
        false if !on_submenu => Arrow::Switch((current + 1) % count),
        _ => Arrow::Native,
    }
}

/// Opens the menu titled `titles[open].name` under its title, then follows the
/// pointer and arrow keys between menus until one closes for good. Returns the
/// index of the title to keep highlighted when Esc closed the menu.
#[tauri::command]
pub async fn track_menu_bar(
    window: tauri::Window,
    titles: Vec<Title>,
    open: usize,
) -> Result<Option<usize>, String> {
    #[cfg(windows)]
    {
        win32::track(window, titles, open).await
    }

    #[cfg(not(windows))]
    {
        let _ = (window, titles, open);
        Err("The menu bar is drawn only on Windows".into())
    }
}

#[cfg(windows)]
mod win32 {
    use std::cell::RefCell;
    use std::mem::size_of;
    use std::ptr::null_mut;

    use tauri::menu::ContextMenu;
    use tauri::{Emitter, Manager};
    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{ClientToScreen, PtInRect};
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{VK_ESCAPE, VK_LEFT, VK_RIGHT};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, EndMenu, GetCursorPos, PostMessageW, SetWindowsHookExW, TrackPopupMenuEx,
        UnhookWindowsHookEx, HMENU, MF_POPUP, MSG, MSGF_MENU, TPMPARAMS, TPM_LEFTALIGN,
        TPM_RETURNCMD, TPM_TOPALIGN, TPM_VERTICAL, WH_MSGFILTER, WM_COMMAND, WM_KEYDOWN,
        WM_LBUTTONDOWN, WM_MENUSELECT, WM_MOUSEMOVE,
    };

    use super::{arrow, Arrow, Title};

    const SUBCLASS_ID: usize = 0x4d42; // "MB"

    /// How the open popup ended, when the hook or Esc ended it.
    enum Next {
        Open(usize),
        /// A click on the open menu's own title: close it, as a menu bar does.
        Close,
        /// Esc in the popup itself: close it and keep its title highlighted.
        Escape,
    }

    /// The menu bar while a popup is open; read by the hook and the subclass.
    struct Tracking {
        /// Title boxes in screen pixels.
        titles: Vec<RECT>,
        current: usize,
        /// The open popup.
        top: HMENU,
        /// The menu holding the selected item (`WM_MENUSELECT`): the popup or one of its submenus.
        selected_in: HMENU,
        /// The selected item opens a submenu.
        on_submenu: bool,
        /// The last pointer position, so a keyboard switch isn't undone by a
        /// mouse message from a pointer that hasn't moved off the old title.
        pointer: POINT,
        next: Option<Next>,
    }

    thread_local! {
        static TRACKING: RefCell<Option<Tracking>> = const { RefCell::new(None) };
    }

    impl Tracking {
        fn title_at(&self, pt: POINT) -> Option<usize> {
            self.titles
                .iter()
                .position(|rect| unsafe { PtInRect(rect, pt) } != 0)
        }

        /// Handles a message from the menu's loop; true ends the popup and drops the message.
        fn filter(&mut self, msg: &MSG) -> bool {
            match msg.message {
                WM_MOUSEMOVE => {
                    if (msg.pt.x, msg.pt.y) == (self.pointer.x, self.pointer.y) {
                        return false;
                    }
                    self.pointer = msg.pt;
                    match self.title_at(msg.pt) {
                        Some(i) if i != self.current => self.end(Next::Open(i)),
                        _ => false,
                    }
                }
                WM_LBUTTONDOWN => match self.title_at(msg.pt) {
                    Some(i) if i == self.current => self.end(Next::Close),
                    Some(i) => self.end(Next::Open(i)),
                    None => false,
                },
                WM_KEYDOWN => {
                    let key = msg.wParam as u16;
                    let in_top = self.selected_in == self.top;
                    if key == VK_ESCAPE && in_top {
                        // The menu closes itself; only remember why.
                        self.next = Some(Next::Escape);
                        return false;
                    }
                    if key != VK_LEFT && key != VK_RIGHT {
                        return false;
                    }
                    let count = self.titles.len();
                    match arrow(key == VK_LEFT, self.current, count, in_top, self.on_submenu) {
                        Arrow::Switch(i) => self.end(Next::Open(i)),
                        Arrow::Native => false,
                    }
                }
                _ => false,
            }
        }

        fn end(&mut self, next: Next) -> bool {
            self.next = Some(next);
            true
        }
    }

    unsafe extern "system" fn filter_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code == MSGF_MENU as i32 {
            let msg = &*(lparam as *const MSG);
            let end = TRACKING.with_borrow_mut(|t| t.as_mut().is_some_and(|t| t.filter(msg)));
            if end {
                EndMenu();
                return 1;
            }
        }
        CallNextHookEx(null_mut(), code, wparam, lparam)
    }

    /// Follows the selection, sent to the window that owns the popup.
    unsafe extern "system" fn watch_selection(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if msg == WM_MENUSELECT && lparam != 0 {
            let flags = (wparam >> 16) as u32 & 0xffff;
            TRACKING.with_borrow_mut(|t| {
                if let Some(t) = t {
                    t.selected_in = lparam as HMENU;
                    t.on_submenu = flags & MF_POPUP != 0;
                }
            });
        }
        DefSubclassProc(hwnd, msg, wparam, lparam)
    }

    pub async fn track(
        window: tauri::Window,
        titles: Vec<Title>,
        open: usize,
    ) -> Result<Option<usize>, String> {
        if open >= titles.len() {
            return Err("No such menu".into());
        }
        // Gathered here, off the main thread, since each call waits on it.
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let menu = window.app_handle().menu().ok_or("No menu")?;
        let items = menu.items().map_err(|e| e.to_string())?;
        let mut menus = Vec::new();
        for title in &titles {
            let submenu = items
                .iter()
                .filter_map(|item| item.as_submenu())
                .find(|submenu| submenu.text().is_ok_and(|text| text == title.name))
                .ok_or(format!("No menu {}", title.name))?;
            menus.push(submenu.hpopupmenu().map_err(|e| e.to_string())?);
        }

        let (tx, rx) = std::sync::mpsc::channel();
        let main = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(unsafe { run(&main, hwnd as HWND, scale, &titles, &menus, open) });
            })
            .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || rx.recv())
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
    }

    /// Runs on the main thread: popup after popup until the user is done.
    unsafe fn run(
        window: &tauri::Window,
        hwnd: HWND,
        scale: f64,
        titles: &[Title],
        menus: &[isize],
        mut open: usize,
    ) -> Option<usize> {
        if TRACKING.with_borrow(|t| t.is_some()) {
            return None;
        }
        let rects = titles
            .iter()
            .map(|t| {
                let mut from = POINT {
                    x: (t.left * scale) as i32,
                    y: (t.top * scale) as i32,
                };
                let mut to = POINT {
                    x: (t.right * scale) as i32,
                    y: (t.bottom * scale) as i32,
                };
                ClientToScreen(hwnd, &mut from);
                ClientToScreen(hwnd, &mut to);
                RECT {
                    left: from.x,
                    top: from.y,
                    right: to.x,
                    bottom: to.y,
                }
            })
            .collect::<Vec<_>>();
        let mut pointer = POINT { x: 0, y: 0 };
        GetCursorPos(&mut pointer);

        let hook = SetWindowsHookExW(
            WH_MSGFILTER,
            Some(filter_hook),
            null_mut(),
            GetCurrentThreadId(),
        );
        SetWindowSubclass(hwnd, Some(watch_selection), SUBCLASS_ID, 0);

        let escaped = loop {
            let top = menus[open] as HMENU;
            let rect = rects[open];
            TRACKING.with_borrow_mut(|t| {
                // Keep the pointer from the last popup (see `Tracking::pointer`).
                let pointer = t.as_ref().map_or(pointer, |t| t.pointer);
                *t = Some(Tracking {
                    titles: rects.clone(),
                    current: open,
                    top,
                    selected_in: top,
                    on_submenu: false,
                    pointer,
                    next: None,
                });
            });
            let _ = window.emit_to(window.label(), "menu-bar", &titles[open].name);

            // Below the title; the excluded rectangle keeps the title visible
            // if the menu has to go above it instead.
            let params = TPMPARAMS {
                cbSize: size_of::<TPMPARAMS>() as u32,
                rcExclude: rect,
            };
            let flags = TPM_LEFTALIGN | TPM_TOPALIGN | TPM_VERTICAL | TPM_RETURNCMD;
            let command = TrackPopupMenuEx(top, flags, rect.left, rect.bottom, hwnd, &params);
            let next = TRACKING.with_borrow_mut(|t| t.as_mut().and_then(|t| t.next.take()));

            if command != 0 {
                // muda's subclass on this window turns it into a menu event,
                // as it does for a native menu bar.
                PostMessageW(hwnd, WM_COMMAND, command as usize, 0);
                break None;
            }
            match next {
                Some(Next::Open(i)) => open = i,
                Some(Next::Escape) => break Some(open),
                Some(Next::Close) | None => break None,
            }
        };

        RemoveWindowSubclass(hwnd, Some(watch_selection), SUBCLASS_ID);
        UnhookWindowsHookEx(hook);
        TRACKING.with_borrow_mut(|t| *t = None);
        escaped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn left_in_the_popup_moves_to_the_previous_menu() {
        assert_eq!(arrow(true, 2, 5, true, false), Arrow::Switch(1));
        assert_eq!(arrow(true, 2, 5, true, true), Arrow::Switch(1));
    }

    #[test]
    fn left_in_a_submenu_closes_it() {
        assert_eq!(arrow(true, 2, 5, false, false), Arrow::Native);
    }

    #[test]
    fn right_opens_a_submenu_or_moves_to_the_next_menu() {
        assert_eq!(arrow(false, 2, 5, true, true), Arrow::Native);
        assert_eq!(arrow(false, 2, 5, true, false), Arrow::Switch(3));
        assert_eq!(arrow(false, 2, 5, false, false), Arrow::Switch(3));
    }

    #[test]
    fn arrows_wrap_around() {
        assert_eq!(arrow(true, 0, 5, true, false), Arrow::Switch(4));
        assert_eq!(arrow(false, 4, 5, true, false), Arrow::Switch(0));
    }
}
