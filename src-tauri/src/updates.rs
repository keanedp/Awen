//! Automatic updates (W-071), with `tauri-plugin-updater`. It reads
//! `latest.json` from the latest GitHub release (`plugins.updater` in
//! `tauri.conf.json`) and checks each download against the public key there.
//!
//! Awen checks quietly at launch (unless Settings turns it off) and loudly
//! from Check for Updates…. Accepting an update downloads it, then quits the
//! way Quit does, so every window asks about unsaved changes. Once the last
//! window has closed, `documents::close_next` calls `install`, which replaces
//! the app and relaunches it. Keeping a window open cancels the update.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Settings → Check for updates at launch.
const CHECK_AT_LAUNCH: &str = "checkForUpdates";

#[derive(Default)]
pub struct Updates {
    /// A check is under way, so a second one doesn't stack another dialog.
    checking: AtomicBool,
    /// The downloaded update, waiting for the windows to close.
    ready: Mutex<Option<(Update, Vec<u8>)>>,
    /// From download until relaunch; the app keeps running with no windows meanwhile.
    installing: AtomicBool,
}

fn updates(app: &AppHandle) -> tauri::State<'_, Updates> {
    app.state::<Updates>()
}

/// The quiet check at launch. Not in debug builds, which `make dev` runs and
/// the updater can't replace.
pub fn check_at_launch(app: &AppHandle) {
    let value = crate::preferences::value(app, CHECK_AT_LAUNCH);
    if !cfg!(debug_assertions) && checks_at_launch(value.as_ref()) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { check(&app, false).await });
    }
}

/// Check for Updates…: also says when Awen is up to date, or the check failed.
pub fn check_now(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { check(&app, true).await });
}

/// Whether the saved preference asks for a check at launch; on unless turned off.
fn checks_at_launch(value: Option<&Value>) -> bool {
    value.and_then(Value::as_bool).unwrap_or(true)
}

async fn check(app: &AppHandle, manual: bool) {
    if updates(app).checking.swap(true, Ordering::SeqCst) {
        return;
    }
    let result = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    updates(app).checking.store(false, Ordering::SeqCst);
    match result {
        Ok(Some(update)) => offer(app, update),
        Ok(None) if manual => {
            app.dialog()
                .message(format!(
                    "Awen {} is the newest version.",
                    app.package_info().version
                ))
                .title("You're up to date")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }
        Err(e) if manual => show_error(app, "Couldn't check for updates", e),
        _ => {}
    }
}

fn offer(app: &AppHandle, update: Update) {
    let handle = app.clone();
    app.dialog()
        .message(offer_message(&update.version, &update.current_version))
        .title("A new version of Awen is available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and Relaunch".into(),
            "Later".into(),
        ))
        .show(move |install| {
            if install {
                tauri::async_runtime::spawn(async move { download(&handle, update).await });
            }
        });
}

fn offer_message(version: &str, current: &str) -> String {
    format!("Awen {version} is available. You have {current}. Awen will close its windows, asking about unsaved changes, and relaunch.")
}

/// Downloads the update, then quits; `install` finishes once the windows have closed.
async fn download(app: &AppHandle, update: Update) {
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            let state = updates(app);
            if let Ok(mut ready) = state.ready.lock() {
                *ready = Some((update, bytes));
            }
            state.installing.store(true, Ordering::SeqCst);
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || crate::documents::quit(&handle));
        }
        Err(e) => show_error(app, "Couldn't download the update", e),
    }
}

/// Whether an update is waiting for the windows to close, or installing.
/// The app keeps running meanwhile, even on Windows.
pub fn installing(app: &AppHandle) -> bool {
    updates(app).installing.load(Ordering::SeqCst)
}

/// A window kept its unsaved changes: forget the update. The next check offers it again.
pub fn cancel(app: &AppHandle) {
    let state = updates(app);
    if let Ok(mut ready) = state.ready.lock() {
        *ready = None;
    }
    state.installing.store(false, Ordering::SeqCst);
}

/// Installs the downloaded update and relaunches. Called when the last window
/// has closed; returns `false` if there was no update to install.
pub fn install(app: &AppHandle) -> bool {
    let Some((update, bytes)) = updates(app).ready.lock().ok().and_then(|mut r| r.take()) else {
        return false;
    };
    let app = app.clone();
    // Off the main thread: on macOS, installing into a folder that needs an
    // administrator password asks for it on the main thread and waits.
    // On Windows, `install` starts the installer, which relaunches Awen, and exits.
    tauri::async_runtime::spawn_blocking(move || match update.install(bytes) {
        Ok(()) => app.restart(),
        // Relaunch anyway, as promised, with the version that's still there.
        Err(e) => app
            .dialog()
            .message(e.to_string())
            .title("Couldn't install the update")
            .kind(MessageDialogKind::Error)
            .show(move |_| app.restart()),
    });
    true
}

fn show_error(app: &AppHandle, title: &str, error: tauri_plugin_updater::Error) {
    app.dialog()
        .message(error.to_string())
        .title(title)
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_launch_check_is_on_unless_turned_off() {
        assert!(checks_at_launch(None));
        assert!(checks_at_launch(Some(&json!(true))));
        assert!(!checks_at_launch(Some(&json!(false))));
        assert!(checks_at_launch(Some(&json!("no"))));
    }

    #[test]
    fn the_offer_names_both_versions() {
        let message = offer_message("0.3.0", "0.2.0");
        assert!(message.starts_with("Awen 0.3.0 is available. You have 0.2.0."));
    }
}
