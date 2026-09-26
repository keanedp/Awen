//! macOS: routes system quit requests (Dock → Quit, logging out, restarting)
//! through the same close-each-window flow as Quit Writer, so unsaved changes
//! are asked about. tao's app delegate has no `applicationShouldTerminate:`,
//! so `install` adds one to its class.
//!
//! The handler answers `NSTerminateLater` and starts `documents::quit`. When
//! that finishes or is cancelled, `reply` gives AppKit the answer. Logout
//! waits meanwhile, and is cancelled if the user keeps a document open.

use tauri::AppHandle;

/// Adds the delegate method. Call from `setup`, on the main thread.
#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) {
    macos::install(app)
}

#[cfg(not(target_os = "macos"))]
pub fn install(_app: &AppHandle) {}

/// Whether the system is waiting for an answer to a quit request.
pub fn pending() -> bool {
    #[cfg(target_os = "macos")]
    return macos::PENDING.load(std::sync::atomic::Ordering::SeqCst);
    #[cfg(not(target_os = "macos"))]
    false
}

/// Answers the waiting quit request; with `true` AppKit then terminates the app.
pub fn reply(_terminate: bool) {
    #[cfg(target_os = "macos")]
    macos::reply(_terminate)
}

#[cfg(target_os = "macos")]
mod macos {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;

    use objc2::ffi::{class_addMethod, object_getClass};
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::sel;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSApplicationTerminateReply};
    use tauri::AppHandle;

    type Handler = extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject) -> usize;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    pub static PENDING: AtomicBool = AtomicBool::new(false);

    pub fn install(app: &AppHandle) {
        let _ = APP.set(app.clone());
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(delegate) = NSApplication::sharedApplication(mtm).delegate() else {
            return;
        };
        let handler: Handler = should_terminate;
        unsafe {
            let class = object_getClass((&*delegate as *const _) as *const AnyObject);
            // NSApplicationTerminateReply (NSUInteger) from (self, _cmd, NSApplication*).
            class_addMethod(
                class as *mut AnyClass,
                sel!(applicationShouldTerminate:),
                std::mem::transmute::<Handler, Imp>(handler),
                c"Q@:@".as_ptr(),
            );
        }
    }

    extern "C-unwind" fn should_terminate(_: &AnyObject, _: Sel, _: *mut AnyObject) -> usize {
        let Some(app) = APP.get() else {
            return NSApplicationTerminateReply::TerminateNow.0;
        };
        PENDING.store(true, Ordering::SeqCst);
        // Closing windows from inside this callback is re-entrant; start on the next turn.
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || crate::documents::quit(&handle));
        NSApplicationTerminateReply::TerminateLater.0
    }

    pub fn reply(terminate: bool) {
        if !PENDING.swap(false, Ordering::SeqCst) {
            return;
        }
        let Some(app) = APP.get() else { return };
        let _ = app.run_on_main_thread(move || {
            if let Some(mtm) = MainThreadMarker::new() {
                NSApplication::sharedApplication(mtm).replyToApplicationShouldTerminate(terminate);
            }
        });
    }
}
