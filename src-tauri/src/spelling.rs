//! The system spell checker (W-057): `NSSpellChecker` on macOS, `ISpellChecker`
//! on Windows. The editor draws the marks itself (`editor/spelling.ts`): WebKit's
//! own marks vanish whenever CodeMirror redraws a line.
//!
//! Offsets are UTF-16 code units, as in JavaScript strings. The commands are
//! synchronous, so they run on the main thread, which both checkers expect.

/// The misspelled words in `text`, as `[start, end)` offsets.
#[tauri::command]
pub fn check_spelling(text: String) -> Result<Vec<(usize, usize)>, String> {
    imp::check(&text)
}

/// Suggested spellings for a misspelled word, best first.
#[tauri::command]
pub fn spelling_guesses(word: String) -> Result<Vec<String>, String> {
    imp::guesses(&word)
}

/// Adds a word to the user's dictionary.
#[tauri::command]
pub fn learn_spelling(word: String) -> Result<(), String> {
    imp::learn(&word)
}

/// Accepts a word in every window until the app quits.
#[tauri::command]
pub fn ignore_spelling(word: String) -> Result<(), String> {
    imp::ignore(&word)
}

#[cfg(target_os = "macos")]
mod imp {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSNotFound, NSRange, NSString};
    use std::sync::OnceLock;

    /// One spell document for the whole app, so Ignore Spelling holds in every window.
    fn tag() -> isize {
        static TAG: OnceLock<isize> = OnceLock::new();
        *TAG.get_or_init(NSSpellChecker::uniqueSpellDocumentTag)
    }

    pub fn check(text: &str) -> Result<Vec<(usize, usize)>, String> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let string = NSString::from_str(text);
        let mut found = Vec::new();
        let mut start = 0;
        loop {
            // No language: the checker's own, which follows System Settings
            // (and detects the language itself when set to Automatic).
            let range = unsafe {
                checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                    &string,
                    start as isize,
                    None,
                    false,
                    tag(),
                    std::ptr::null_mut(),
                )
            };
            if range.location == NSNotFound as usize || range.length == 0 {
                break;
            }
            start = range.location + range.length;
            found.push((range.location, start));
        }
        Ok(found)
    }

    pub fn guesses(word: &str) -> Result<Vec<String>, String> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let string = NSString::from_str(word);
        let guesses = checker.guessesForWordRange_inString_language_inSpellDocumentWithTag(
            NSRange::new(0, string.length()),
            &string,
            None,
            tag(),
        );
        Ok(guesses.map_or_else(Vec::new, |g| g.iter().map(|s| s.to_string()).collect()))
    }

    pub fn learn(word: &str) -> Result<(), String> {
        NSSpellChecker::sharedSpellChecker().learnWord(&NSString::from_str(word));
        Ok(())
    }

    pub fn ignore(word: &str) -> Result<(), String> {
        NSSpellChecker::sharedSpellChecker()
            .ignoreWord_inSpellDocumentWithTag(&NSString::from_str(word), tag());
        Ok(())
    }
}

#[cfg(windows)]
mod imp {
    use std::cell::RefCell;
    use windows::core::{Result, HSTRING, PWSTR};
    use windows::Win32::Globalization::{
        GetUserDefaultLocaleName, ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory,
        CORRECTIVE_ACTION_NONE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };

    thread_local! {
        /// Kept for the app's lifetime: `Ignore` only lasts as long as the
        /// checker, and making one per check would be slow. Always the main thread.
        static CHECKER: RefCell<Option<ISpellChecker>> = const { RefCell::new(None) };
    }

    /// A checker for the user's language, or US English if Windows has no dictionary for it.
    unsafe fn create() -> Result<ISpellChecker> {
        unsafe {
            // Already initialized on the main thread (tao); this only makes sure.
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let factory: ISpellCheckerFactory =
                CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)?;
            let mut name = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH
            let len = GetUserDefaultLocaleName(&mut name);
            if len > 1 {
                let language = HSTRING::from(String::from_utf16_lossy(&name[..len as usize - 1]));
                if factory.IsSupported(&language).is_ok_and(|s| s.as_bool()) {
                    return factory.CreateSpellChecker(&language);
                }
            }
            factory.CreateSpellChecker(&HSTRING::from("en-US"))
        }
    }

    fn with_checker<T>(
        f: impl FnOnce(&ISpellChecker) -> Result<T>,
    ) -> std::result::Result<T, String> {
        CHECKER
            .with(|cell| {
                let mut cell = cell.borrow_mut();
                let checker = match cell.take() {
                    Some(checker) => checker,
                    None => unsafe { create()? },
                };
                let result = f(&checker);
                *cell = Some(checker);
                result
            })
            .map_err(|e| e.to_string())
    }

    pub fn check(text: &str) -> std::result::Result<Vec<(usize, usize)>, String> {
        with_checker(|checker| unsafe {
            let errors = checker.Check(&HSTRING::from(text))?;
            let mut found = Vec::new();
            loop {
                let mut error = None;
                if errors.Next(&mut error).is_err() {
                    break;
                }
                let Some(error) = error else { break };
                // Every error but "no action" (which Windows reports for none).
                if error.CorrectiveAction()? != CORRECTIVE_ACTION_NONE {
                    let start = error.StartIndex()? as usize;
                    found.push((start, start + error.Length()? as usize));
                }
            }
            Ok(found)
        })
    }

    pub fn guesses(word: &str) -> std::result::Result<Vec<String>, String> {
        with_checker(|checker| unsafe {
            let suggestions = checker.Suggest(&HSTRING::from(word))?;
            let mut guesses = Vec::new();
            loop {
                let mut item = [PWSTR::null()];
                let mut fetched = 0;
                if suggestions.Next(&mut item, Some(&mut fetched)).is_err() || fetched == 0 {
                    break;
                }
                guesses.push(item[0].to_string().unwrap_or_default());
                CoTaskMemFree(Some(item[0].0 as *const _));
            }
            Ok(guesses)
        })
    }

    pub fn learn(word: &str) -> std::result::Result<(), String> {
        with_checker(|checker| unsafe { checker.Add(&HSTRING::from(word)) })
    }

    pub fn ignore(word: &str) -> std::result::Result<(), String> {
        with_checker(|checker| unsafe { checker.Ignore(&HSTRING::from(word)) })
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    const UNSUPPORTED: &str = "Spell checking isn't available on this system.";

    pub fn check(_text: &str) -> Result<Vec<(usize, usize)>, String> {
        Err(UNSUPPORTED.into())
    }

    pub fn guesses(_word: &str) -> Result<Vec<String>, String> {
        Err(UNSUPPORTED.into())
    }

    pub fn learn(_word: &str) -> Result<(), String> {
        Err(UNSUPPORTED.into())
    }

    pub fn ignore(_word: &str) -> Result<(), String> {
        Err(UNSUPPORTED.into())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::imp;

    #[test]
    fn finds_misspellings_at_utf16_offsets() {
        // "é" and the emoji are one and two UTF-16 units: offsets must match JavaScript's.
        let found = imp::check("café 😀 this is splled wrongg").unwrap();
        assert_eq!(found, [(16, 22), (23, 29)]);
    }

    #[test]
    fn suggests_spellings() {
        assert!(imp::guesses("splled")
            .unwrap()
            .contains(&"spelled".to_string()));
    }
}
