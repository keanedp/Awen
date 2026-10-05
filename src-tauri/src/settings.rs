//! The Settings window (W-021): one for the whole app, opened from Awen →
//! Settings… on macOS or Edit → Settings… on Windows. It loads the `/settings`
//! route, which sizes the window to its content and then shows it.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "settings";

/// Brings the Settings window forward, opening it if needed.
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("settings".into()))
        .title("Settings")
        // The page sets the height to fit its content.
        .inner_size(500.0, 400.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        // Shown by the page once sized, so it doesn't jump.
        .visible(false);
    // As in document windows, the page runs under the title bar, so the height
    // it sets is the whole window's. With the default style the web view is
    // pushed below the title bar but keeps the full height, clipping the bottom.
    #[cfg(target_os = "macos")]
    let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
    let built = builder.build();
    #[cfg(windows)]
    if let Ok(window) = &built {
        if let Err(error) = crate::accelerators::install(window) {
            eprintln!("Could not install Settings shortcuts: {error}");
        }
    }
    if let Err(e) = built {
        eprintln!("Could not open Settings: {e}");
    }
}

/// Whether the Settings window is the one menu commands go to.
pub fn is_focused(app: &AppHandle) -> bool {
    crate::documents::focused_window(app).is_some_and(|w| w.label() == LABEL)
}
