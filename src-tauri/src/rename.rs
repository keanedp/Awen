//! Rename, tag and move a document from its title, like NSDocument apps
//! (`Inspiration/file_name_save.png`). On macOS clicking the title shows a
//! native popover with Name, Tags, Where and Locked; the frontend then applies
//! the result with `move_document` / `create_document`, `set_file_tags` and
//! `set_file_locked`.

use std::fs;
use std::io::{ErrorKind, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, WebviewWindow, Wry};

/// What the popover asks for. Only returned when something changed (or an
/// untitled document was confirmed with Return).
#[derive(Serialize)]
pub struct DocumentInfo {
    /// The full file name, extension included.
    name: String,
    directory: String,
    /// The new Finder tags, only when the user changed them.
    tags: Option<Vec<String>>,
    /// The new locked state, only when the user changed it.
    locked: Option<bool>,
}

/// The title's rectangle in CSS pixels, from `getBoundingClientRect()`.
#[derive(Deserialize)]
pub struct Anchor {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Shows the title popover under `anchor`. `None` when cancelled or unchanged.
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn show_document_info(
    window: WebviewWindow,
    anchor: Anchor,
    path: Option<String>,
) -> Result<Option<DocumentInfo>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |webview| {
            // SAFETY: Tauri hands us the live WKWebView (an NSView) on the main thread.
            let view = unsafe { &*(webview.inner() as *const objc2_app_kit::NSView) };
            macos::show(view, &anchor, path.as_deref(), tx);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| e.to_string())
}

/// Other platforms have no title popover; Save As covers renaming there.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn show_document_info(
    _anchor: Anchor,
    _path: Option<String>,
) -> Result<Option<DocumentInfo>, String> {
    Err("Renaming from the title is only available on macOS".into())
}

/// Renames or moves the window's file to `to`, which must not exist yet.
#[tauri::command]
pub fn move_document(
    app: AppHandle,
    window: WebviewWindow,
    docs: tauri::State<'_, crate::documents::Documents>,
    recent: tauri::State<'_, crate::recent::Recent<Wry>>,
    from: String,
    to: String,
) -> Result<(), String> {
    move_file(&from, &to)?;
    crate::documents::set_document_path(window, docs, to.clone())?;
    let _ = recent.forget(&app, &from);
    recent.note(&app, to)
}

/// Saves an untitled document for the first time, refusing to overwrite a file.
#[tauri::command]
pub fn create_document(path: String, contents: String) -> Result<(), String> {
    check_name(&path)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| match e.kind() {
            ErrorKind::AlreadyExists => taken(&path),
            _ => format!("Could not save {path}: {e}"),
        })?;
    file.write_all(contents.as_bytes())
        .map_err(|e| format!("Could not save {path}: {e}"))
}

/// Replaces the file's Finder tags.
#[tauri::command]
pub fn set_file_tags(path: String, tags: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return macos::set_tags(&path, &tags);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, tags);
        Err("File tags are only available on macOS".into())
    }
}

/// Sets or clears the file's locked flag, as Finder's Get Info → Locked does.
#[tauri::command]
pub fn set_file_locked(path: String, locked: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return macos::set_locked(&path, locked);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, locked);
        Err("Locking files is only available on macOS".into())
    }
}

/// Whether the file is locked. Always false outside macOS.
#[tauri::command]
pub fn is_file_locked(path: String) -> bool {
    #[cfg(target_os = "macos")]
    return macos::is_locked(&path);
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        false
    }
}

/// Moves the file at `from` to `to`, refusing to replace another file.
fn move_file(from: &str, to: &str) -> Result<(), String> {
    check_name(to)?;
    if let (Ok(existing), Ok(source)) = (fs::metadata(to), fs::metadata(from)) {
        // A case-only rename finds the file itself on a case-insensitive volume.
        if !same_file(&existing, &source) {
            return Err(taken(to));
        }
    }
    match fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::CrossesDevices => {
            fs::copy(from, to).map_err(|e| format!("Could not move to {to}: {e}"))?;
            fs::remove_file(from).map_err(|e| format!("Could not remove {from}: {e}"))
        }
        Err(e) => Err(format!("Could not move to {to}: {e}")),
    }
}

fn check_name(path: &str) -> Result<(), String> {
    match Path::new(path).file_name().and_then(|n| n.to_str()) {
        Some(name) if !name.starts_with('.') => Ok(()),
        _ => Err(format!("“{path}” is not a valid file name.")),
    }
}

fn taken(path: &str) -> String {
    let path = Path::new(path);
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let folder = path
        .parent()
        .and_then(|p| p.file_name())
        .unwrap_or_default()
        .to_string_lossy();
    format!("The name “{name}” is already taken in “{folder}”. Please choose a different name.")
}

#[cfg(unix)]
fn same_file(a: &fs::Metadata, b: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    a.dev() == b.dev() && a.ino() == b.ino()
}

#[cfg(not(unix))]
fn same_file(_a: &fs::Metadata, _b: &fs::Metadata) -> bool {
    false
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{Anchor, DocumentInfo};
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol, ProtocolObject, Sel};
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSButton, NSControl, NSControlStateValueOff, NSControlStateValueOn,
        NSControlTextEditingDelegate, NSMenuItem, NSModalResponseOK, NSOpenPanel, NSPopUpButton,
        NSPopover, NSPopoverBehavior, NSPopoverDelegate, NSTextAlignment, NSTextField,
        NSTextFieldDelegate, NSTextView, NSTokenField, NSTokenFieldDelegate, NSView,
        NSViewController, NSWorkspace,
    };
    use objc2_foundation::{
        NSArray, NSFileManager, NSNotification, NSNumber, NSPoint, NSRect, NSRectEdge, NSSize,
        NSString, NSURLIsUserImmutableKey, NSURLTagNamesKey, NSURL,
    };
    use std::cell::{Cell, RefCell};
    use std::path::Path;
    use std::sync::mpsc::Sender;

    /// The Name field's tag, to tell it apart from the Tags field in delegate calls.
    const NAME_TAG: isize = 1;

    /// The document as it was when the popover opened.
    struct Original {
        name: String,
        extension: String,
        directory: String,
        tags: Vec<String>,
        locked: bool,
        untitled: bool,
    }

    pub struct Ivars {
        popover: Retained<NSPopover>,
        name: Retained<NSTextField>,
        tags: Retained<NSTokenField>,
        place: Retained<NSPopUpButton>,
        /// The Locked checkbox; untitled documents have none.
        locked: Option<Retained<NSButton>>,
        original: Original,
        /// Esc was pressed: close without applying anything.
        cancelled: Cell<bool>,
        /// Return was pressed in the Name field.
        committed: Cell<bool>,
        /// The Other… folder panel is open; the popover must stay.
        choosing: Cell<bool>,
        /// The Where item to go back to if Other… is cancelled.
        selected: Cell<isize>,
        tx: RefCell<Option<Sender<Option<DocumentInfo>>>>,
    }

    define_class!(
        /// Owns the popover's controls and reports the result when it closes.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "WriterDocumentInfoController"]
        #[ivars = Ivars]
        struct Controller;

        impl Controller {
            #[unsafe(method(placeChanged:))]
            fn place_changed(&self, _sender: &NSPopUpButton) {
                self.choose_place();
            }

            #[unsafe(method(lockedChanged:))]
            fn locked_changed(&self, _sender: &NSButton) {
                self.enable_fields();
            }
        }

        unsafe impl NSObjectProtocol for Controller {}

        unsafe impl NSPopoverDelegate for Controller {
            #[unsafe(method(popoverShouldClose:))]
            fn popover_should_close(&self, _popover: &NSPopover) -> bool {
                !self.ivars().choosing.get()
            }

            #[unsafe(method(popoverDidClose:))]
            fn popover_did_close(&self, _notification: &NSNotification) {
                if let Some(tx) = self.ivars().tx.borrow_mut().take() {
                    let _ = tx.send(self.result());
                }
            }
        }

        unsafe impl NSControlTextEditingDelegate for Controller {
            #[unsafe(method(control:textView:doCommandBySelector:))]
            fn do_command(&self, control: &NSControl, _text_view: &NSTextView, command: Sel) -> bool {
                let ivars = self.ivars();
                let cancel = command == sel!(cancelOperation:);
                // Return in the Tags field is left alone: it turns the typed text into a token.
                let commit = command == sel!(insertNewline:) && control.tag() == NAME_TAG;
                if cancel || commit {
                    ivars.cancelled.set(cancel);
                    ivars.committed.set(commit);
                    unsafe { ivars.popover.performClose(None) };
                }
                cancel || commit
            }
        }

        unsafe impl NSTextFieldDelegate for Controller {}
        unsafe impl NSTokenFieldDelegate for Controller {}
    );

    thread_local! {
        // Popovers and controls hold their delegate weakly; this keeps the latest one alive.
        static CURRENT: RefCell<Option<Retained<Controller>>> = const { RefCell::new(None) };
    }

    impl Controller {
        fn result(&self) -> Option<DocumentInfo> {
            let ivars = self.ivars();
            if ivars.cancelled.get() {
                return None;
            }
            let original = &ivars.original;
            ivars.name.validateEditing();
            ivars.tags.validateEditing();

            let typed = ivars.name.stringValue().to_string().trim().to_string();
            let stem = if typed.is_empty() {
                stem_of(&original.name)
            } else {
                typed
            };
            // Keep the extension unless the user typed it themselves.
            let has_extension = Path::new(&stem)
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case(&original.extension));
            let name = if has_extension || original.extension.is_empty() {
                stem
            } else {
                format!("{stem}.{}", original.extension)
            };
            let directory = selected_path(&ivars.place).unwrap_or(original.directory.clone());
            let tags = strings(ivars.tags.objectValue().as_deref());
            let tags_changed = tags != original.tags;
            let locked = self.is_locked();
            let locked_changed = locked != original.locked;

            let changed = name != original.name
                || directory != original.directory
                || tags_changed
                || locked_changed;
            let confirmed_untitled = original.untitled && ivars.committed.get();
            if !(changed || confirmed_untitled) {
                return None;
            }
            Some(DocumentInfo {
                name,
                directory,
                tags: tags_changed.then_some(tags),
                locked: locked_changed.then_some(locked),
            })
        }

        fn is_locked(&self) -> bool {
            let checkbox = self.ivars().locked.as_ref();
            checkbox.is_some_and(|c| c.state() == NSControlStateValueOn)
        }

        /// Like Finder, a locked file can't be renamed, moved or tagged.
        fn enable_fields(&self) {
            let ivars = self.ivars();
            let enabled = !self.is_locked();
            ivars.name.setEnabled(enabled);
            ivars.tags.setEnabled(enabled);
            ivars.place.setEnabled(enabled);
        }

        /// Handles a Where selection; Other… asks for a folder.
        fn choose_place(&self) {
            let ivars = self.ivars();
            let popup = &ivars.place;
            if selected_path(popup).is_some() {
                ivars.selected.set(popup.indexOfSelectedItem());
                return;
            }
            let mtm = self.mtm();
            let panel = NSOpenPanel::openPanel(mtm);
            panel.setCanChooseFiles(false);
            panel.setCanChooseDirectories(true);
            panel.setCanCreateDirectories(true);
            panel.setPrompt(Some(&NSString::from_str("Choose")));
            if let Some(item) = popup.itemAtIndex(ivars.selected.get()) {
                if let Some(dir) = item.representedObject() {
                    if let Some(dir) = dir.downcast_ref::<NSString>() {
                        panel.setDirectoryURL(Some(&NSURL::fileURLWithPath(dir)));
                    }
                }
            }
            ivars.choosing.set(true);
            let response = panel.runModal();
            ivars.choosing.set(false);

            let chosen = (response == NSModalResponseOK)
                .then(|| panel.URL())
                .flatten()
                .and_then(|url| url.path());
            match (chosen, popup.menu()) {
                // Like NSDocument, the chosen folder goes to the top of the list.
                (Some(path), Some(menu)) => {
                    menu.insertItem_atIndex(&place_item(&path.to_string(), mtm), 0);
                    popup.selectItemAtIndex(0);
                    ivars.selected.set(0);
                }
                _ => popup.selectItemAtIndex(ivars.selected.get()),
            }
        }
    }

    fn stem_of(name: &str) -> String {
        Path::new(name)
            .file_stem()
            .map_or(name.to_string(), |s| s.to_string_lossy().into_owned())
    }

    fn strings(value: Option<&AnyObject>) -> Vec<String> {
        value
            .and_then(|v| v.downcast_ref::<NSArray>())
            .map(|array| {
                array
                    .iter()
                    .filter_map(|s| s.downcast_ref::<NSString>().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn selected_path(popup: &NSPopUpButton) -> Option<String> {
        let object = popup.selectedItem()?.representedObject()?;
        object.downcast_ref::<NSString>().map(|s| s.to_string())
    }

    fn read_tags(path: &str) -> Vec<String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let mut value = None;
        // SAFETY: a plain resource lookup on a file URL.
        match unsafe { url.getResourceValue_forKey_error(&mut value, NSURLTagNamesKey) } {
            Ok(()) => strings(value.as_deref()),
            Err(_) => Vec::new(),
        }
    }

    pub fn is_locked(path: &str) -> bool {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let mut value = None;
        // SAFETY: a plain resource lookup on a file URL.
        let found =
            unsafe { url.getResourceValue_forKey_error(&mut value, NSURLIsUserImmutableKey) };
        found.is_ok()
            && value
                .as_deref()
                .and_then(|v| v.downcast_ref::<NSNumber>())
                .is_some_and(|n| n.boolValue())
    }

    pub fn set_locked(path: &str, locked: bool) -> Result<(), String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let value = NSNumber::numberWithBool(locked);
        let value: &AnyObject = &value;
        // SAFETY: NSURLIsUserImmutableKey takes a boolean NSNumber.
        unsafe { url.setResourceValue_forKey_error(Some(value), NSURLIsUserImmutableKey) }.map_err(
            |e| {
                let action = if locked { "lock" } else { "unlock" };
                format!("Could not {action} the file: {}", e.localizedDescription())
            },
        )
    }

    pub fn set_tags(path: &str, tags: &[String]) -> Result<(), String> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        let tags: Vec<_> = tags.iter().map(|t| NSString::from_str(t)).collect();
        let tags = NSArray::from_retained_slice(&tags);
        let value: &AnyObject = &tags;
        // SAFETY: NSURLTagNamesKey takes an array of strings.
        unsafe { url.setResourceValue_forKey_error(Some(value), NSURLTagNamesKey) }
            .map_err(|e| format!("Could not set tags: {}", e.localizedDescription()))
    }

    /// A Where menu item: the folder's icon and Finder name, holding its path.
    fn place_item(path: &str, mtm: MainThreadMarker) -> Retained<NSMenuItem> {
        let ns_path = NSString::from_str(path);
        let title = NSFileManager::defaultManager().displayNameAtPath(&ns_path);
        // SAFETY: no action selector.
        let item = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                &title,
                None,
                &NSString::new(),
            )
        };
        let icon = NSWorkspace::sharedWorkspace().iconForFile(&ns_path);
        icon.setSize(NSSize::new(16.0, 16.0));
        item.setImage(Some(&icon));
        let object: &AnyObject = &ns_path;
        unsafe { item.setRepresentedObject(Some(object)) };
        item
    }

    /// The current folder, then the usual Finder favourites, then Other….
    fn place_popup(current: &str, mtm: MainThreadMarker) -> Retained<NSPopUpButton> {
        let popup =
            NSPopUpButton::initWithFrame_pullsDown(NSPopUpButton::alloc(mtm), NSRect::ZERO, false);
        let menu = popup.menu().expect("pop-up buttons have a menu");
        menu.addItem(&place_item(current, mtm));
        menu.addItem(&NSMenuItem::separatorItem(mtm));
        let home = std::env::var("HOME").unwrap_or_default();
        for folder in [
            "Desktop",
            "Documents",
            "Downloads",
            "Library/Mobile Documents/com~apple~CloudDocs",
        ] {
            let path = format!("{home}/{folder}");
            if path != current && Path::new(&path).is_dir() {
                menu.addItem(&place_item(&path, mtm));
            }
        }
        menu.addItem(&NSMenuItem::separatorItem(mtm));
        let other = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                &NSString::from_str("Other…"),
                None,
                &NSString::new(),
            )
        };
        menu.addItem(&other);
        popup.selectItemAtIndex(0);
        popup.sizeToFit();
        popup
    }

    fn label(text: &str, mtm: MainThreadMarker) -> Retained<NSTextField> {
        let label = NSTextField::labelWithString(&NSString::from_str(text), mtm);
        label.setAlignment(NSTextAlignment::Right);
        label.sizeToFit();
        label
    }

    /// Lays out Name / Tags / Where as right-aligned labels beside their controls.
    /// `trailing` (the Locked checkbox) sits at the end of the last row, as in NSDocument apps.
    fn content_view(
        rows: [(&str, &NSView); 3],
        trailing: Option<&NSView>,
        mtm: MainThreadMarker,
    ) -> Retained<NSView> {
        let (width, pad, label_width, gap, spacing) = (420.0, 16.0, 56.0, 8.0, 10.0);
        let field_x = pad + label_width + gap;
        let heights: Vec<f64> = rows.iter().map(|(_, v)| v.frame().size.height).collect();
        let gaps = (rows.len() - 1) as f64;
        let height = heights.iter().sum::<f64>() + spacing * gaps + pad * 2.0;
        let view = NSView::initWithFrame(
            NSView::alloc(mtm),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(width, height)),
        );
        // AppKit's y axis points up, so rows are placed from the top down.
        let mut top = height - pad;
        let last = rows.len() - 1;
        for (i, ((text, control), h)) in rows.into_iter().zip(heights).enumerate() {
            let y = top - h;
            let mut right = width - pad;
            if let Some(accessory) = trailing.filter(|_| i == last) {
                let size = accessory.frame().size;
                right -= size.width;
                accessory.setFrame(NSRect::new(
                    NSPoint::new(right, y + (h - size.height) / 2.0),
                    size,
                ));
                view.addSubview(accessory);
                right -= gap * 2.0;
            }
            control.setFrame(NSRect::new(
                NSPoint::new(field_x, y),
                NSSize::new(right - field_x, h),
            ));
            let label = label(text, mtm);
            let lh = label.frame().size.height;
            label.setFrame(NSRect::new(
                NSPoint::new(pad, y + (h - lh) / 2.0),
                NSSize::new(label_width, lh),
            ));
            view.addSubview(&label);
            view.addSubview(control);
            top = y - spacing;
        }
        view
    }

    pub fn show(
        view: &NSView,
        anchor: &Anchor,
        path: Option<&str>,
        tx: Sender<Option<DocumentInfo>>,
    ) {
        let mtm = MainThreadMarker::new().expect("the title popover must run on the main thread");
        let original = match path {
            Some(path) => {
                let p = Path::new(path);
                Original {
                    name: p
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    extension: p
                        .extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned(),
                    directory: p.parent().unwrap_or(p).to_string_lossy().into_owned(),
                    tags: read_tags(path),
                    locked: is_locked(path),
                    untitled: false,
                }
            }
            None => Original {
                name: "Untitled.md".into(),
                extension: "md".into(),
                directory: format!("{}/Documents", std::env::var("HOME").unwrap_or_default()),
                tags: Vec::new(),
                locked: false,
                untitled: true,
            },
        };

        let name =
            NSTextField::textFieldWithString(&NSString::from_str(&stem_of(&original.name)), mtm);
        name.setTag(NAME_TAG);
        name.sizeToFit();
        let tags = NSTokenField::initWithFrame(NSTokenField::alloc(mtm), NSRect::ZERO);
        let initial: Vec<_> = original
            .tags
            .iter()
            .map(|t| NSString::from_str(t))
            .collect();
        let initial = NSArray::from_retained_slice(&initial);
        unsafe { tags.setObjectValue(Some(&initial as &AnyObject)) };
        tags.setFrameSize(NSSize::new(0.0, name.frame().size.height));
        let place = place_popup(&original.directory, mtm);

        // A file that doesn't exist yet can't be locked.
        let locked = (!original.untitled).then(|| {
            // SAFETY: the target and action are set once the controller exists.
            let checkbox = unsafe {
                NSButton::checkboxWithTitle_target_action(
                    &NSString::from_str("Locked"),
                    None,
                    None,
                    mtm,
                )
            };
            checkbox.setState(if original.locked {
                NSControlStateValueOn
            } else {
                NSControlStateValueOff
            });
            checkbox.sizeToFit();
            checkbox
        });
        let content = content_view(
            [("Name:", &name), ("Tags:", &tags), ("Where:", &place)],
            locked.as_deref().map(|c| c as &NSView),
            mtm,
        );
        let controller_view = NSViewController::new(mtm);
        controller_view.setView(&content);
        let popover = NSPopover::new(mtm);
        popover.setContentViewController(Some(&controller_view));
        popover.setContentSize(content.frame().size);
        popover.setBehavior(NSPopoverBehavior::Transient);

        let controller = Controller::alloc(mtm).set_ivars(Ivars {
            popover: popover.clone(),
            name: name.clone(),
            tags: tags.clone(),
            place: place.clone(),
            locked: locked.clone(),
            original,
            cancelled: Cell::new(false),
            committed: Cell::new(false),
            choosing: Cell::new(false),
            selected: Cell::new(0),
            tx: RefCell::new(Some(tx)),
        });
        let controller: Retained<Controller> = unsafe { msg_send![super(controller), init] };
        let delegate = ProtocolObject::from_ref(&*controller);
        popover.setDelegate(Some(delegate));
        unsafe {
            name.setDelegate(Some(ProtocolObject::from_ref(&*controller)));
            tags.setDelegate(Some(ProtocolObject::from_ref(&*controller)));
            place.setTarget(Some(&controller));
            place.setAction(Some(sel!(placeChanged:)));
            if let Some(checkbox) = &locked {
                checkbox.setTarget(Some(&controller));
                checkbox.setAction(Some(sel!(lockedChanged:)));
            }
        }
        controller.enable_fields();
        if let Some(previous) = CURRENT.replace(Some(controller.clone())) {
            previous.ivars().popover.close();
        }

        // The anchor is in CSS pixels from the top; convert if the view isn't flipped.
        let bounds = view.bounds();
        let flipped = view.isFlipped();
        let y = if flipped {
            anchor.y
        } else {
            bounds.size.height - anchor.y - anchor.height
        };
        let rect = NSRect::new(
            NSPoint::new(anchor.x, y),
            NSSize::new(anchor.width, anchor.height),
        );
        let below = if flipped {
            NSRectEdge::MaxY
        } else {
            NSRectEdge::MinY
        };
        popover.showRelativeToRect_ofView_preferredEdge(rect, view, below);

        if popover.isShown() {
            if name.isEnabled() {
                unsafe { name.selectText(None) };
            }
        } else {
            // Nothing to wait for: dropping the sender ends the command with `None`.
            controller.ivars().tx.borrow_mut().take();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// A fresh empty folder, removed when dropped.
    struct Folder(PathBuf);

    impl Folder {
        fn new() -> Self {
            static NEXT: AtomicUsize = AtomicUsize::new(0);
            let n = NEXT.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir().join(format!("writer-test-{}-{n}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Folder(dir)
        }

        fn path(&self, name: &str) -> String {
            self.0.join(name).to_string_lossy().into_owned()
        }

        fn write(&self, name: &str, text: &str) -> String {
            let path = self.path(name);
            fs::write(&path, text).unwrap();
            path
        }

        fn names(&self) -> Vec<String> {
            let mut names: Vec<String> = fs::read_dir(&self.0)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            names.sort();
            names
        }
    }

    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn create_writes_a_new_file() {
        let dir = Folder::new();
        let path = dir.path("Notes.md");
        create_document(path.clone(), "# Hello\r\n".into()).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "# Hello\r\n");
    }

    #[test]
    fn create_never_overwrites() {
        let dir = Folder::new();
        let path = dir.write("Notes.md", "keep me");
        let err = create_document(path.clone(), "new".into()).unwrap_err();
        assert!(err.contains("“Notes.md” is already taken"), "{err}");
        assert_eq!(fs::read_to_string(path).unwrap(), "keep me");
    }

    #[test]
    fn create_rejects_bad_names() {
        let dir = Folder::new();
        assert!(create_document(dir.path(".hidden"), String::new()).is_err());
        assert!(create_document(dir.path(".."), String::new()).is_err());
        assert_eq!(dir.names(), Vec::<String>::new());
    }

    #[test]
    fn move_renames_the_file() {
        let dir = Folder::new();
        let from = dir.write("Draft.md", "text");
        move_file(&from, &dir.path("Final.md")).unwrap();
        assert_eq!(dir.names(), ["Final.md"]);
        assert_eq!(fs::read_to_string(dir.path("Final.md")).unwrap(), "text");
    }

    #[test]
    fn move_into_another_folder() {
        let dir = Folder::new();
        fs::create_dir(dir.path("sub")).unwrap();
        let from = dir.write("Notes.md", "text");
        let to = dir.0.join("sub").join("Notes.md");
        move_file(&from, to.to_str().unwrap()).unwrap();
        assert_eq!(fs::read_to_string(to).unwrap(), "text");
        assert!(!Path::new(&from).exists());
    }

    #[test]
    fn move_never_overwrites() {
        let dir = Folder::new();
        let from = dir.write("Draft.md", "draft");
        let to = dir.write("Final.md", "final");
        let err = move_file(&from, &to).unwrap_err();
        assert!(err.contains("“Final.md” is already taken"), "{err}");
        assert_eq!(fs::read_to_string(&from).unwrap(), "draft");
        assert_eq!(fs::read_to_string(&to).unwrap(), "final");
    }

    // Outside Unix `same_file` can't tell, so a case-only rename counts as taken.
    #[cfg(unix)]
    #[test]
    fn move_can_change_only_the_case() {
        let dir = Folder::new();
        let from = dir.write("notes.md", "text");
        move_file(&from, &dir.path("Notes.md")).unwrap();
        assert_eq!(dir.names(), ["Notes.md"]);
    }

    #[test]
    fn move_rejects_bad_names() {
        let dir = Folder::new();
        let from = dir.write("Notes.md", "text");
        assert!(move_file(&from, &dir.path(".Notes.md")).is_err());
        assert_eq!(dir.names(), ["Notes.md"]);
    }

    #[test]
    fn move_of_a_missing_file_fails() {
        let dir = Folder::new();
        assert!(move_file(&dir.path("Gone.md"), &dir.path("New.md")).is_err());
        assert_eq!(dir.names(), Vec::<String>::new());
    }

    #[test]
    fn check_name_rules() {
        assert!(check_name("/a/Notes.md").is_ok());
        assert!(check_name("/a/No extension").is_ok());
        assert!(check_name("/a/.hidden.md").is_err());
        assert!(check_name("/").is_err());
        assert!(check_name("").is_err());
    }

    #[test]
    fn taken_names_the_file_and_folder() {
        assert_eq!(
            taken("/Users/me/Documents/Notes.md"),
            "The name “Notes.md” is already taken in “Documents”. Please choose a different name."
        );
    }
}
