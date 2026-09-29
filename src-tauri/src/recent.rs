//! File → Open Recent: a short most-recent-first list of documents, kept in
//! `recent.json` in the app data folder and mirrored into a native submenu.
//! Opened files also go to the system's recent documents (the Dock menu on
//! macOS, the taskbar Jump List on Windows), which hand choices back as
//! ordinary file opens.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::menu::{MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

/// How many documents the menu lists, as in TextEdit.
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
        let noted = path.clone();
        let _ = app.run_on_main_thread(move || system::note(&noted));
        self.update(app, |paths| move_to_top(paths, path))
    }

    /// Drops `path`, e.g. after it failed to open because it was moved or deleted.
    pub fn forget(&self, app: &AppHandle<R>, path: &str) -> Result<(), String> {
        self.update(app, |paths| paths.retain(|p| p != path))
    }

    pub fn clear(&self, app: &AppHandle<R>) -> Result<(), String> {
        let _ = app.run_on_main_thread(system::clear);
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

fn move_to_top(paths: &mut Vec<String>, path: String) {
    paths.retain(|p| p != &path);
    paths.insert(0, path);
    paths.truncate(LIMIT);
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

/// The system's recent documents. Both calls must run on the main thread.
/// There is no per-file removal: macOS leaves out missing files by itself.
mod system {
    #[cfg(target_os = "macos")]
    pub fn note(path: &str) {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSDocumentController;
        use objc2_foundation::{NSString, NSURL};

        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        NSDocumentController::sharedDocumentController(mtm).noteNewRecentDocumentURL(&url);
    }

    #[cfg(target_os = "macos")]
    pub fn clear() {
        use objc2::MainThreadMarker;
        use objc2_app_kit::NSDocumentController;

        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        unsafe { NSDocumentController::sharedDocumentController(mtm).clearRecentDocuments(None) };
    }

    /// The Jump List's Recent category only lists file types registered to
    /// the app, which the installer's `.md` association does.
    #[cfg(windows)]
    pub fn note(path: &str) {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::{SHAddToRecentDocs, SHARD_PATHW};

        let path = HSTRING::from(path);
        unsafe { SHAddToRecentDocs(SHARD_PATHW.0 as u32, Some(path.as_ptr().cast())) };
    }

    /// Clears this app's Jump List only. `SHAddToRecentDocs` with a null path
    /// would wipe the user's recent files for every app.
    #[cfg(windows)]
    pub fn clear() {
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED,
        };
        use windows::Win32::UI::Shell::{ApplicationDestinations, IApplicationDestinations};

        unsafe {
            // Usually already initialized on the main thread; balance only our own call.
            let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
            if let Ok(destinations) = CoCreateInstance::<_, IApplicationDestinations>(
                &ApplicationDestinations,
                None,
                CLSCTX_INPROC_SERVER,
            ) {
                let _ = destinations.RemoveAllDestinations();
            }
            if initialized {
                CoUninitialize();
            }
        }
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    pub fn note(_path: &str) {}

    #[cfg(not(any(target_os = "macos", windows)))]
    pub fn clear() {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn noting_moves_a_path_to_the_top_once() {
        let mut list = paths(&["/a.md", "/b.md", "/c.md"]);
        move_to_top(&mut list, "/c.md".into());
        assert_eq!(list, paths(&["/c.md", "/a.md", "/b.md"]));
        move_to_top(&mut list, "/d.md".into());
        assert_eq!(list, paths(&["/d.md", "/c.md", "/a.md", "/b.md"]));
    }

    #[test]
    fn the_list_keeps_the_newest_ten() {
        let mut list = Vec::new();
        for n in 0..12 {
            move_to_top(&mut list, format!("/{n}.md"));
        }
        assert_eq!(list.len(), LIMIT);
        assert_eq!(list.first().unwrap(), "/11.md");
        assert_eq!(list.last().unwrap(), "/2.md");
    }

    #[test]
    fn labels_are_file_names() {
        assert_eq!(
            labels(&paths(&["/Users/me/Notes.md", "/Users/me/Todo.md"])),
            ["Notes.md", "Todo.md"]
        );
    }

    #[test]
    fn shared_names_show_their_folder() {
        assert_eq!(
            labels(&paths(&[
                "/work/Notes.md",
                "/home/Notes.md",
                "/home/Todo.md"
            ])),
            ["Notes.md — work", "Notes.md — home", "Todo.md"]
        );
    }

    #[test]
    fn ampersands_escape_only_on_windows() {
        let expected = if cfg!(windows) { "R&&D.md" } else { "R&D.md" };
        assert_eq!(labels(&paths(&["/R&D.md"])), [expected]);
    }
}
