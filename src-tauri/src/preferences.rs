//! App-wide preferences, kept in `preferences.json` in the app data folder and
//! shared by every window. The frontend owns their names, types and defaults
//! (`src/lib/preferences.ts`); Rust only stores the JSON values, except for
//! the theme, which it applies to the whole app (`apply_theme`).

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, Theme};

/// Settings → Appearance: "system", "light" or "dark".
const THEME: &str = "theme";

#[derive(Default)]
pub struct Preferences {
    values: Mutex<Map<String, Value>>,
    /// `preferences.json`, set by `load` once the path resolver exists.
    store: OnceLock<PathBuf>,
}

#[derive(Clone, Serialize)]
struct Changed {
    key: String,
    value: Value,
}

/// Reads the saved preferences. Call from `setup`, like `recent::load`.
pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let file = app.path().app_data_dir()?.join("preferences.json");
    let prefs = app.state::<Preferences>();
    if let Ok(mut values) = prefs.values.lock() {
        *values = read(&file);
        apply_theme(app, values.get(THEME));
    }
    let _ = prefs.store.set(file);
    Ok(())
}

/// Every saved preference; the frontend fills in defaults for the rest.
#[tauri::command]
pub fn preferences(prefs: tauri::State<'_, Preferences>) -> Map<String, Value> {
    prefs.values.lock().map(|v| v.clone()).unwrap_or_default()
}

/// Saves one preference and tells every window, as `preference-changed`.
#[tauri::command]
pub fn set_preference(
    app: AppHandle,
    prefs: tauri::State<'_, Preferences>,
    key: String,
    value: Value,
) -> Result<(), String> {
    {
        let mut values = prefs.values.lock().map_err(|e| e.to_string())?;
        values.insert(key.clone(), value.clone());
        if let Some(file) = prefs.store.get() {
            write(file, &values)?;
        }
    }
    if key == THEME {
        apply_theme(&app, Some(&value));
    }
    app.emit("preference-changed", Changed { key, value })
        .map_err(|e| e.to_string())
}

/// Sets the app's appearance, which menus, dialogs and every window's
/// `prefers-color-scheme` follow. Done here rather than by each page, so it
/// applies before a window first draws, and to windows opened later.
fn apply_theme<R: Runtime>(app: &AppHandle<R>, value: Option<&Value>) {
    app.set_theme(theme(value));
}

/// The theme a saved value asks for; `None` follows the system, as does anything unexpected.
fn theme(value: Option<&Value>) -> Option<Theme> {
    match value.and_then(Value::as_str) {
        Some("light") => Some(Theme::Light),
        Some("dark") => Some(Theme::Dark),
        _ => None,
    }
}

/// The saved values; none if the file is missing or unreadable.
fn read(file: &Path) -> Map<String, Value> {
    std::fs::read(file)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write(file: &Path, values: &Map<String, Value>) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let json = serde_json::to_vec_pretty(values).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| format!("Could not save preferences: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("writer-prefs-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("nested").join("preferences.json")
    }

    #[test]
    fn a_missing_file_is_empty() {
        assert!(read(&temp_file("missing")).is_empty());
    }

    #[test]
    fn a_corrupt_file_is_empty() {
        let file = temp_file("corrupt");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "{ not json").unwrap();
        assert!(read(&file).is_empty());
        std::fs::write(&file, "[1, 2]").unwrap();
        assert!(read(&file).is_empty());
        let _ = std::fs::remove_dir_all(file.parent().unwrap().parent().unwrap());
    }

    #[test]
    fn the_theme_follows_the_system_unless_light_or_dark() {
        assert_eq!(theme(Some(&json!("light"))), Some(Theme::Light));
        assert_eq!(theme(Some(&json!("dark"))), Some(Theme::Dark));
        assert_eq!(theme(Some(&json!("system"))), None);
        assert_eq!(theme(Some(&json!("sepia"))), None);
        assert_eq!(theme(Some(&json!(true))), None);
        assert_eq!(theme(None), None);
    }

    #[test]
    fn values_round_trip_and_the_folder_is_created() {
        let file = temp_file("round-trip");
        let mut values = Map::new();
        values.insert("wordCount".into(), json!(false));
        values.insert("exportFormat".into(), json!("pdf"));
        write(&file, &values).unwrap();
        assert_eq!(read(&file), values);
        let _ = std::fs::remove_dir_all(file.parent().unwrap().parent().unwrap());
    }
}
