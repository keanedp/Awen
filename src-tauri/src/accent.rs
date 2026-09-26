//! The system accent colour, for the web UI's `--accent` token.
//!
//! WKWebView resolves `-apple-system-control-accent` to a fixed blue unless the
//! (private) system-appearance mode is on, and WebView2 doesn't expose the
//! Windows accent to CSS at all, so both are read natively.

use serde::Serialize;

/// CSS colours for the light and dark appearance: `light`/`dark` fill controls,
/// `text_*` colour accent text such as links. macOS uses one colour for both;
/// Windows 11 uses different shades of the accent (WinUI's `AccentFillColorDefault`
/// and `AccentTextFillColorPrimary`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accent {
    light: String,
    dark: String,
    text_light: String,
    text_dark: String,
}

/// The accent colour from System Settings / Windows Settings. None elsewhere.
#[tauri::command]
pub fn accent_colors() -> Option<Accent> {
    #[cfg(target_os = "macos")]
    {
        let (light, dark) = (macos::accent(false)?, macos::accent(true)?);
        Some(Accent {
            text_light: light.clone(),
            text_dark: dark.clone(),
            light,
            dark,
        })
    }
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

    /// WinUI uses darker accent shades on light surfaces and lighter ones on dark.
    pub fn accent() -> windows::core::Result<super::Accent> {
        let settings = UISettings::new()?;
        let color = |kind| -> windows::core::Result<String> {
            let c = settings.GetColorValue(kind)?;
            Ok(super::hex(c.R, c.G, c.B))
        };
        Ok(super::Accent {
            light: color(UIColorType::AccentDark1)?,
            dark: color(UIColorType::AccentLight2)?,
            text_light: color(UIColorType::AccentDark2)?,
            text_dark: color(UIColorType::AccentLight3)?,
        })
    }
}
