//! Export: a native "Export To" save panel on macOS, and PDF output on every
//! desktop platform. The PDF is printed from the webview's current page, which
//! the frontend fills with the rendered document (print CSS applies).

use serde::Serialize;
use tauri::WebviewWindow;

// Only the macOS export sheet uses these; other OSes get `choose_export`'s stub.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub enum Format {
    Html,
    Pdf,
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
impl Format {
    const ALL: [Format; 2] = [Format::Html, Format::Pdf];

    fn title(self) -> &'static str {
        match self {
            Format::Html => "HTML",
            Format::Pdf => "PDF",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Format::Html => "html",
            Format::Pdf => "pdf",
        }
    }

    fn parse(value: &str) -> Format {
        match value {
            "pdf" => Format::Pdf,
            _ => Format::Html,
        }
    }
}

#[derive(Serialize)]
pub struct ExportTarget {
    path: String,
    format: Format,
}

/// Shows the export panel as a sheet on the window. `None` when cancelled.
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn choose_export(
    window: WebviewWindow,
    name: String,
    directory: Option<String>,
    format: String,
) -> Result<Option<ExportTarget>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let format = Format::parse(&format);
    window
        .with_webview(move |webview| {
            // SAFETY: Tauri hands us the live NSWindow on the main thread.
            let ns_window = unsafe { &*(webview.ns_window() as *const objc2_app_kit::NSWindow) };
            macos::present_export_panel(ns_window, &name, directory.as_deref(), format, tx);
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|e| e.to_string())
}

/// Other platforms use the dialog plugin's file-type list from the frontend instead.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn choose_export(
    _name: String,
    _directory: Option<String>,
    _format: String,
) -> Result<Option<ExportTarget>, String> {
    Err("The native export panel is only available on macOS".into())
}

/// Writes the webview's current page to `path` as a paginated PDF.
#[tauri::command]
pub async fn export_pdf(window: WebviewWindow, path: String) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

    #[cfg(target_os = "macos")]
    window
        .with_webview(move |webview| {
            // SAFETY: Tauri hands us the live WKWebView and NSWindow on the main thread.
            unsafe {
                let wk = &*(webview.inner() as *const objc2_web_kit::WKWebView);
                let ns_window = &*(webview.ns_window() as *const objc2_app_kit::NSWindow);
                macos::print_to_pdf(wk, ns_window, &path, tx);
            }
        })
        .map_err(|e| e.to_string())?;

    #[cfg(windows)]
    window
        .with_webview(move |webview| {
            if let Err(e) = windows_pdf::print_to_pdf(&webview.controller(), &path, tx.clone()) {
                let _ = tx.send(Err(e.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (window, path);
        let _ = tx.send(Err(
            "PDF export is not supported on this platform yet".into()
        ));
    }

    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "PDF export was interrupted".to_string())?
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{ExportTarget, Format};
    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, Bool, NSObject};
    use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSModalResponse, NSModalResponseOK, NSPopUpButton, NSPrintInfo, NSPrintJobSavingURL,
        NSPrintOperation, NSPrintSaveJob, NSPrintingPaginationMode, NSSavePanel, NSTextField,
        NSView, NSWindow,
    };
    use objc2_foundation::{NSArray, NSPoint, NSRect, NSSize, NSString, NSURL};
    use objc2_uniform_type_identifiers::UTType;
    use objc2_web_kit::WKWebView;
    use std::ffi::c_void;
    use std::sync::mpsc::Sender;

    fn content_type(format: Format) -> Retained<NSArray<UTType>> {
        let ext = NSString::from_str(format.extension());
        let types: Vec<_> = UTType::typeWithFilenameExtension(&ext)
            .into_iter()
            .collect();
        NSArray::from_retained_slice(&types)
    }

    /// Replaces the name field's extension with the format's, keeping what the user typed.
    fn apply_format(panel: &NSSavePanel, format: Format) {
        panel.setAllowedContentTypes(&content_type(format));
        let name = panel.nameFieldStringValue().to_string();
        let stem = std::path::Path::new(&name)
            .file_stem()
            .map_or(name.clone(), |s| s.to_string_lossy().into_owned());
        panel.setNameFieldStringValue(&NSString::from_str(&format!(
            "{stem}.{}",
            format.extension()
        )));
    }

    pub struct FormatTargetIvars {
        panel: Retained<NSSavePanel>,
    }

    define_class!(
        /// Receives "Export To" pop-up changes and updates the panel.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "AwenExportFormatTarget"]
        #[ivars = FormatTargetIvars]
        struct FormatTarget;

        impl FormatTarget {
            #[unsafe(method(formatChanged:))]
            fn format_changed(&self, sender: &NSPopUpButton) {
                let index = sender.indexOfSelectedItem().max(0) as usize;
                apply_format(&self.ivars().panel, Format::ALL[index.min(Format::ALL.len() - 1)]);
            }
        }
    );

    impl FormatTarget {
        fn new(panel: Retained<NSSavePanel>, mtm: MainThreadMarker) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(FormatTargetIvars { panel });
            unsafe { msg_send![super(this), init] }
        }
    }

    /// The "Export To: [HTML ▾]" row shown at the bottom of the panel.
    fn accessory_view(popup: &NSPopUpButton, mtm: MainThreadMarker) -> Retained<NSView> {
        let label = NSTextField::labelWithString(&NSString::from_str("Export To:"), mtm);
        label.sizeToFit();
        popup.sizeToFit();
        let (pad, gap) = (20.0, 8.0);
        let label_size = label.frame().size;
        let popup_size = NSSize::new(
            popup.frame().size.width.max(200.0),
            popup.frame().size.height,
        );
        let height = popup_size.height + 2.0 * pad;
        let width = label_size.width + gap + popup_size.width + 2.0 * pad;

        let view = NSView::initWithFrame(
            NSView::alloc(mtm),
            NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(width, height)),
        );
        label.setFrameOrigin(NSPoint::new(pad, (height - label_size.height) / 2.0));
        popup.setFrame(NSRect::new(
            NSPoint::new(
                pad + label_size.width + gap,
                (height - popup_size.height) / 2.0,
            ),
            popup_size,
        ));
        view.addSubview(&label);
        view.addSubview(popup);
        view
    }

    pub fn present_export_panel(
        window: &NSWindow,
        name: &str,
        directory: Option<&str>,
        format: Format,
        tx: Sender<Option<ExportTarget>>,
    ) {
        let mtm = MainThreadMarker::new().expect("export panel must run on the main thread");
        let panel = NSSavePanel::savePanel(mtm);
        panel.setNameFieldLabel(Some(&NSString::from_str("Export As:")));
        panel.setPrompt(Some(&NSString::from_str("Export")));
        panel.setCanCreateDirectories(true);
        panel.setNameFieldStringValue(&NSString::from_str(name));
        if let Some(dir) = directory {
            panel.setDirectoryURL(Some(&NSURL::fileURLWithPath(&NSString::from_str(dir))));
        }

        let popup =
            NSPopUpButton::initWithFrame_pullsDown(NSPopUpButton::alloc(mtm), NSRect::ZERO, false);
        let titles: Vec<_> = Format::ALL
            .iter()
            .map(|f| NSString::from_str(f.title()))
            .collect();
        popup.addItemsWithTitles(&NSArray::from_retained_slice(&titles));
        popup.selectItemAtIndex(
            Format::ALL
                .iter()
                .position(|f| f.extension() == format.extension())
                .unwrap_or(0) as isize,
        );

        // The pop-up holds its target weakly; the completion block keeps it alive.
        let target = FormatTarget::new(panel.clone(), mtm);
        unsafe {
            popup.setTarget(Some(&target));
            popup.setAction(Some(sel!(formatChanged:)));
        }
        panel.setAccessoryView(Some(&accessory_view(&popup, mtm)));
        apply_format(&panel, format);

        let done_panel = panel.clone();
        let done_popup = popup.clone();
        let handler = RcBlock::new(move |response: NSModalResponse| {
            let _keep_alive = &target;
            let result = (response == NSModalResponseOK)
                .then(|| done_panel.URL())
                .flatten()
                .and_then(|url| url.path())
                .map(|path| ExportTarget {
                    path: path.to_string(),
                    format: Format::ALL[(done_popup.indexOfSelectedItem().max(0) as usize)
                        .min(Format::ALL.len() - 1)],
                });
            let _ = tx.send(result);
        });
        panel.beginSheetModalForWindow_completionHandler(window, &handler);
    }

    pub struct PdfDelegateIvars;

    define_class!(
        /// Reports when a save-to-file print operation finishes.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "AwenPdfExportDelegate"]
        #[ivars = PdfDelegateIvars]
        struct PdfDelegate;

        impl PdfDelegate {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn did_run(&self, _op: &NSPrintOperation, success: Bool, context: *mut c_void) {
                // SAFETY: `context` is the sender boxed in `print_to_pdf`, reclaimed exactly once.
                let tx = unsafe { Box::from_raw(context as *mut Sender<Result<(), String>>) };
                let result = if success.as_bool() { Ok(()) } else { Err("Could not create the PDF".into()) };
                let _ = tx.send(result);
            }
        }
    );

    thread_local! {
        // Print operations don't retain their delegate; one shared instance lives on the main thread.
        static PDF_DELEGATE: Retained<PdfDelegate> = {
            let mtm = MainThreadMarker::new().expect("main thread");
            let this = PdfDelegate::alloc(mtm).set_ivars(PdfDelegateIvars);
            unsafe { msg_send![super(this), init] }
        };
    }

    /// # Safety
    /// Must be called on the main thread with the app's live webview and window.
    pub unsafe fn print_to_pdf(
        webview: &WKWebView,
        window: &NSWindow,
        path: &str,
        tx: Sender<Result<(), String>>,
    ) {
        let info: Retained<NSPrintInfo> = msg_send![&NSPrintInfo::sharedPrintInfo(), copy];
        info.setJobDisposition(NSPrintSaveJob);
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        info.dictionary().setObject_forKey(
            &*url as &AnyObject,
            objc2::runtime::ProtocolObject::from_ref(NSPrintJobSavingURL),
        );
        for set in [NSPrintInfo::setTopMargin, NSPrintInfo::setBottomMargin] {
            set(&info, 54.0);
        }
        for set in [NSPrintInfo::setLeftMargin, NSPrintInfo::setRightMargin] {
            set(&info, 64.0);
        }
        info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
        info.setVerticallyCentered(false);

        let op = webview.printOperationWithPrintInfo(&info);
        op.setShowsPrintPanel(false);
        op.setShowsProgressPanel(false);
        // Without a frame the web view's print view can render blank pages.
        if let Some(view) = op.view() {
            view.setFrame(webview.bounds());
        }

        let context = Box::into_raw(Box::new(tx)) as *mut c_void;
        PDF_DELEGATE.with(|delegate| {
            op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                window,
                Some(delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                context,
            );
        });
    }
}

#[cfg(windows)]
mod windows_pdf {
    use std::sync::mpsc::Sender;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller, ICoreWebView2PrintSettings, ICoreWebView2_7,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    pub fn print_to_pdf(
        controller: &ICoreWebView2Controller,
        path: &str,
        tx: Sender<Result<(), String>>,
    ) -> windows::core::Result<()> {
        unsafe {
            let webview: ICoreWebView2_7 = controller.CoreWebView2()?.cast()?;
            let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                let outcome = match result {
                    Ok(()) if ok => Ok(()),
                    Ok(()) => Err("Could not create the PDF".to_string()),
                    Err(e) => Err(e.to_string()),
                };
                let _ = tx.send(outcome);
                Ok(())
            }));
            webview.PrintToPdf(
                &HSTRING::from(path),
                None::<&ICoreWebView2PrintSettings>,
                &handler,
            )
        }
    }
}
