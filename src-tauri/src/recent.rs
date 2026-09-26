//! File → Open Recent: a short most-recent-first list of documents, kept in
//! `recent.json` in the app data folder and mirrored into a native submenu.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::menu::{MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

/// How many documents the menu lists, as in TextEdit and focused editors.
const LIMIT: usize = 10;

/// Menu ids of the document items are this prefix followed by the full path.
pub const OPEN_PREFIX: &str = "recent:";
pub const CLEAR_ID: &str = "recent_clear";

pub struct Recent<R: Runtime> {
    menu: Submenu<R>,
    paths: Mutex<Vec<String>>,
    /// `recent.json`, set by `load` once the path resolver exists.
    store: OnceLock<PathBuf>,
}

/// Builds the (still empty) Open Recent submenu and keeps it in managed state.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let menu = Submenu::new(app, "Open Recent", true)?;
    let recent = Recent {
        menu: menu.clone(),
        paths: Mutex::new(Vec::new()),
        store: OnceLock::new(),
    };
    recent.refresh(app)?;
    app.manage(recent);
    Ok(menu)
}

/// Fills the list from disk. Call from `setup`: the menu is built before
/// Tauri manages its path resolver, so `app.path()` panics in `build`.
pub fn load<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let file = app.path().app_data_dir()?.join("recent.json");
    let paths = std::fs::read(&file)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Vec<String>>(&bytes).ok())
        .unwrap_or_default();
    let recent = app.state::<Recent<R>>();
    let _ = recent.store.set(file);
    if let Ok(mut current) = recent.paths.lock() {
        *current = paths;
    }
    recent.refresh(app)
}

impl<R: Runtime> Recent<R> {
    /// Moves `path` to the top of the list.
    pub fn note(&self, app: &AppHandle<R>, path: String) -> Result<(), String> {
        self.update(app, |paths| {
            paths.retain(|p| p != &path);
            paths.insert(0, path);
            paths.truncate(LIMIT);
        })
    }

    /// Drops `path`, e.g. after it failed to open because it was moved or deleted.
    pub fn forget(&self, app: &AppHandle<R>, path: &str) -> Result<(), String> {
        self.update(app, |paths| paths.retain(|p| p != path))
    }

    pub fn clear(&self, app: &AppHandle<R>) -> Result<(), String> {
        self.update(app, Vec::clear)
    }

    fn update(
        &self,
        app: &AppHandle<R>,
        change: impl FnOnce(&mut Vec<String>),
    ) -> Result<(), String> {
        {
            let mut paths = self.paths.lock().map_err(|e| e.to_string())?;
            change(&mut paths);
            if let Some(file) = self.store.get() {
                if let Some(dir) = file.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                let json = serde_json::to_vec(&*paths).map_err(|e| e.to_string())?;
                std::fs::write(file, json)
                    .map_err(|e| format!("Could not save recent files: {e}"))?;
            }
        }
        self.refresh(app).map_err(|e| e.to_string())
    }

    /// Rebuilds the submenu: one item per document, then Clear Menu.
    fn refresh(&self, app: &AppHandle<R>) -> tauri::Result<()> {
        for item in self.menu.items()? {
            self.menu.remove(&item)?;
        }
        let paths = self.paths.lock().map(|p| p.clone()).unwrap_or_default();
        for (path, label) in paths.iter().zip(labels(&paths)) {
            let id = format!("{OPEN_PREFIX}{path}");
            self.menu
                .append(&MenuItem::with_id(app, id, label, true, None::<&str>)?)?;
        }
        if !paths.is_empty() {
            self.menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
        // Like other Mac apps, an empty list still shows a disabled Clear Menu.
        self.menu.append(&MenuItem::with_id(
            app,
            CLEAR_ID,
            "Clear Menu",
            !paths.is_empty(),
            None::<&str>,
        )?)
    }
}

/// Menu labels: the file name, plus " — folder" where two entries share a name.
fn labels(paths: &[String]) -> Vec<String> {
    let name = |p: &str| {
        Path::new(p)
            .file_name()
            .map_or_else(|| p.to_string(), |n| n.to_string_lossy().into_owned())
    };
    paths
        .iter()
        .map(|p| {
            let own = name(p);
            let shared = paths.iter().filter(|q| name(q) == own).count() > 1;
            let folder = Path::new(p).parent().and_then(Path::file_name);
            let label = match folder {
                Some(folder) if shared => format!("{own} — {}", folder.to_string_lossy()),
                _ => own,
            };
            // `&` marks a mnemonic in Windows menus.
            if cfg!(windows) {
                label.replace('&', "&&")
            } else {
                label
            }
        })
        .collect()
}
