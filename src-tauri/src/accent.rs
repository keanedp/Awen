//! The system accent colour, for the web UI's `--accent` token.
//!
//! WKWebView resolves `-apple-system-control-accent` to a fixed blue unless the
//! (private) system-appearance mode is on, and WebView2 doesn't expose the
//! Windows accent to CSS at all, so both are read natively.

use serde::Serialize;

/// CSS colours for the light and dark appearance.
#[derive(Serialize)]
pub struct Accent {
    light: String,
    dark: String,
}

/// The accent colour from System Settings / Windows Settings. None elsewhere.
#[tauri::command]
pub fn accent_colors() -> Option<Accent> {
    #[cfg(target_os = "macos")]
    return Some(Accent {
        light: macos::accent(false)?,
        dark: macos::accent(true)?,
    });
    #[cfg(windows)]
    return win::accent().ok();
    #[cfg(not(any(target_os = "macos", windows)))]
    None
}

#[cfg(any(target_os = "macos", windows))]
fn hex(r: u8, g: u8, b: u8) -> String {
    format!("#{r:02x}{g:02x}{b:02x}")
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::Cell;

    use block2::StackBlock;
    use objc2_app_kit::{
        NSAppearance, NSAppearanceNameAqua, NSAppearanceNameDarkAqua, NSColor, NSColorSpace,
    };

    /// `controlAccentColor` is dynamic: it differs slightly between light and dark.
    pub fn accent(dark: bool) -> Option<String> {
        let name = unsafe {
            if dark {
                NSAppearanceNameDarkAqua
            } else {
                NSAppearanceNameAqua
            }
        };
        let appearance = NSAppearance::appearanceNamed(name)?;
        let result = Cell::new(None);
        appearance.performAsCurrentDrawingAppearance(&StackBlock::new(|| {
            let color =
                NSColor::controlAccentColor().colorUsingColorSpace(&NSColorSpace::sRGBColorSpace());
            let byte = |c: f64| (c.clamp(0.0, 1.0) * 255.0).round() as u8;
            result.set(color.map(|c| {
                super::hex(
                    byte(c.redComponent()),
                    byte(c.greenComponent()),
                    byte(c.blueComponent()),
                )
            }));
        }));
        result.take()
    }
}

#[cfg(windows)]
mod win {
    use windows::UI::ViewManagement::{UIColorType, UISettings};

    /// Fluent uses the darker accent shade on light surfaces and a lighter one on dark.
    pub fn accent() -> windows::core::Result<super::Accent> {
        let settings = UISettings::new()?;
        let color = |kind| -> windows::core::Result<String> {
            let c = settings.GetColorValue(kind)?;
            Ok(super::hex(c.R, c.G, c.B))
        };
        Ok(super::Accent {
            light: color(UIColorType::AccentDark1)?,
            dark: color(UIColorType::AccentLight2)?,
        })
    }
}
