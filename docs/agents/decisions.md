# Decisions

A dated log of design decisions and the reasons for them. Newest first. Add an entry when you make a choice a future agent might otherwise reverse. If a decision is superseded, mark it rather than deleting it.

## 2026-09-27: Heading marks hang as far as there is room, like focused editors
- A fixed margin can't fit `###### ` at large sizes without eating a narrow window, and capping how far deep markers hang indented levels 5 and 6 even in wide windows (tried and reverted). focused editors instead hangs each marker by the room beside the column, down to none when the column fills the window, and so does Awen now.
- Done in CSS with a line decoration and `text-indent`, using container query units for the room, rather than an absolutely positioned mark span: nothing to measure or recompute on resize, and `text-indent` moves only the first line of a wrapped heading.

## 2026-09-27: Monaspace Neon replaces Classic Mono
- Settings → Font now offers Monaspace Neon (the default), Argon and Radon, and the system monospace. Classic Mono is gone from the app and the repo. Supersedes the font list and default in "The editor font is a setting" below.
- A saved `"classic"` is no longer a valid choice, so it falls back to Neon.
- Argon is a humanist sans, softer than Neon. Xenon (slab serif) and Krypton (mechanical) are still left out.
- The three Monaspace files add ~1.8 MB to the app (Neon ~510 KB, Argon ~540 KB, Radon ~800 KB); Classic Mono's four files (~170 KB) are gone.

## 2026-09-27: The editor font is a setting
- Reverses the W-021 entry's "font choice left out": Settings → Font offers Classic Mono (still the default), Monaspace Neon, Monaspace Radon and the system monospace. Neon is a clean grotesque, Radon a handwriting face; the other three Monaspace families (Argon, Xenon, Krypton) were left out to keep the menu short and the bundle small.
- Settings only, no View menu item: it's set once, not toggled while writing.
- Editor only. The rendered document keeps the system font (see "Preview, print and exports are set in the system font").
- Monaspace ships as one variable file per family (~510 KB Neon, ~800 KB Radon) rather than four static files each. Italic comes from its `slnt` axis, declared as `font-style: oblique 0deg 11deg`, so `*emphasis*` is a slant, not a separate italic design.
- Monaspace's `liga` feature joins `!=`, `...` and `://`, hiding the Markdown source, so the editor sets `font-variant-ligatures: no-common-ligatures`. Texture healing is in `calt` and stays on. Classic Mono has no `liga` substitutions, so it isn't affected.

## 2026-09-27: Wide tables shrink to fit the printed page
- Print and PDF can't scroll, so a table wider than the page shrinks its text (to 8pt, like Word and Pages) before wrapping, and wraps only between words. Hyphenation was tried and dropped: WebKit split short words like "Sta-tus" even when shrinking would have kept them whole.
- Landscape pages for wide tables were left out: WebKit and WebView2 can't reliably rotate a single page.
- The 6pt floor and links breaking only past it are there so a table never overflows the margin, since that shrinks the whole PDF (see gotchas).

## 2026-09-26: Preview, print and exports are set in the system font
- The editor stays in Classic Mono, but the rendered document uses the OS's own text font (`--font-preview`): SF on macOS, Segoe UI Variable on Windows. The design goal is to look native, and the finished page reads better in a proportional face than in the draft's semi-monospace. `preview.css` styles preview, print, PDF and HTML export alike, so they all follow.
- Inter was tried first (it's close to SF and would look the same on every OS). Dropped because it made HTML exports ~620 KB, and on macOS static Inter lacks SF's automatic optical sizes.
- Trade-off accepted: output isn't identical everywhere. A PDF carries the font of the machine that made it, and an HTML export shows in the reader's system font, because SF and Segoe UI can't be embedded (their licences forbid redistribution).
- The export's stack names fonts explicitly (`-apple-system`, `"Segoe UI"`, Roboto…) rather than starting with `system-ui`: on Windows, `system-ui` can resolve to a locale-specific UI font (e.g. Yu Gothic UI in Japanese) with poor Latin text, which is why GitHub dropped it.

## 2026-09-26: HTML export carries the font licence notice
- Superseded: the export no longer embeds any fonts (see above), so there's no notice. If fonts are ever embedded again, the reasoning below still applies.
- The export embeds the Classic Mono files as data URLs, and anyone can pull them back out, so each export arguably redistributes the fonts. OFL 1.1 condition 2 wants the copyright notice and licence with every copy, and allows a human-readable header. So a short CSS comment (`fontNotice` in `export/html.ts`) with both copyright holders and a link to the OFL goes before the `@font-face` rules. The OFL FAQ says a link is enough for web fonts, so the full licence text isn't embedded.
- The document itself needs no credit: the OFL doesn't cover documents made with the fonts. Don't remove the notice to save bytes (~200 of ~235 KB). If the fonts are ever subset or modified, the Reserved Font Name can no longer be used for the family name.

## 2026-09-26: The app is called Awen
- "Writer" was too generic to search for or trademark. Awen is Welsh for poetic inspiration: short, rare, and it means something to writers. The other candidates are in `ideas/names.md`.
- The bundle identifier changed with it (`com.danielkeane.awen`). `app_data_dir` follows the identifier, so preferences and recent documents saved under the old name don't carry over. That was acceptable before the first release; don't change the identifier again once there are users.
- The repo folder, the `W-` story ids and "focused editors" references keep their names.

## 2026-09-26: Format menu (W-060)
- Modelled on focused editors' (`screenshots/format_menu.png`), with its shortcuts. The Headings and Lists submenus weren't in the screenshot: headings take ⌘1–⌘6 (as in Bear and Typora; ⌘0 is Actual Size), lists have no shortcuts yet. Blockquote is ⌘> on macOS, as in focused editors; on Windows, Ctrl+Shift+. .
- Italic writes `*`, bold `**`, as the preview's markdown-it reads them anywhere, even inside a word (`_` doesn't work there). Both `*` and `_` are recognised when removing a style.
- Every style is a toggle, and runs of `*` are read by count (three = bold and italic), so bold and italic can be added and removed independently.
- Highlight writes `==text==`, rendered by `markdown-it-mark`. It isn't CommonMark, but it's what focused editors, Obsidian and Bear write.
- The menu is disabled in preview and on a locked document, rather than offering to unlock as typing does: a menu command the user can see is greyed out explains itself.
- On Windows, Strikethrough and Clear Styles use Ctrl+Alt, which is AltGr on some keyboard layouts. Check this in W-060's Windows verification.

## 2026-09-26: The editor draws spelling marks with the system checker (W-057)
- WebKit's continuous spell checking kept marks on the text nodes CodeMirror rewrites, and only rechecks the word just typed, so misspellings vanished as you wrote (`screenshots/spellcheck.png`). Neither side can be configured out of that.
- So Rust asks `NSSpellChecker` / `ISpellChecker` (the same dictionaries, learned words and language settings as other apps), and the editor draws the marks and the suggestions menu. Marks now also behave the same on both OSes.
- WebKit's autocorrect and automatic capitalisation go with it (CodeMirror's defaults turn them off). In a Markdown file they changed text you didn't ask to change; if they're missed, add a separate setting rather than turning WebKit's checking back on.
- Only the viewport is checked, after a 400ms pause. Checking the whole document on every edit would cost more than the marks you can't see are worth.

## 2026-09-26: What the settings window (W-021) holds
- Text size, column width, line spacing, spell checking, theme (Match System / Light / Dark), plus word count and code highlighting mirrored from the View menu. One pane, no tabs, until later features bring enough settings to group.
- Column width and line spacing are three named presets rather than free numbers: easier to keep the column looking right, and it's how focused editors offers them.
- Text size is also on View → Bigger / Smaller / Actual Size, as in TextEdit and focused editors, since that's where Mac and Windows users look for it.
- A separate window, as settings are in Mac and Windows apps, not a sheet inside a document window: it applies to every window, and stays open while you watch a document change.
- The theme is applied natively (`AppHandle::set_theme`) rather than by overriding CSS tokens with a `data-theme` attribute: menus, dialogs, the title popover and scrollbars follow it too, and it applies before any window draws.
- Text size, width and spacing apply to the screen only (the tokens sit on `.app-root`). Print, PDF and HTML export keep their paper typography, as focused editors' templates do.
- The controls are Bits UI (per the 2026-09-23 components decision), not native `<select>`: WKWebView would show a real macOS menu, but WebView2's popup looks like Chrome, not Windows 11.
- Left out: font choice (the design depends on Classic Mono, and focused editors doesn't offer one either; superseded 2026-09-27, see "The editor font is a setting"), the export format (the export dialog already remembers the last one), and reading speed (too niche for now). Focus mode and typewriter scrolling (W-017, W-018) add their settings here once they're built.

## 2026-09-25: Preferences live in a JSON file owned by Rust, typed in the frontend
- `preferences.json` in the app data folder, like `recent.json`, rather than the webview's `localStorage`. localStorage belongs to the webview's origin, which differs between `make dev` and a bundled build, and its storage and syncing between windows is up to WKWebView and WebView2. A Rust-owned file is one source of truth, easy to find and reset, and Rust can broadcast changes to every window.
- Rust stores untyped JSON and the frontend validates it (`parsePreferences`), so adding a preference is a frontend-only change.
- Preferences are app-wide, not per window or per document: the menu checkmark is app-wide too, and focused editors' view settings behave the same way.

## 2026-09-25: How words are counted
- Words are Unicode word segments (`Intl.Segmenter`) that contain a letter or digit, so "don't" and "3.14" are one word each, punctuation and emoji are none, and CJK text is segmented properly. Hyphenated compounds count once, as in Word and Pages. The segmenter's own `isWordLike` isn't used, because JavaScriptCore and V8 disagree about numbers (gotchas.md).
- Markdown syntax is left out using the editor's parse tree rather than regexes, so it matches what's highlighted as syntax. URLs, link titles, reference labels and images (alt text too) aren't counted, since a reader doesn't read them as prose. Link text, headings and code are counted.
- Syntax is removed, not replaced by a space, so the count matches the rendered text: `un*frigging*believable` and `H<sub>2</sub>O` are one word each. The exception is syntax that renders as no text (images, rules), which separates the words around it. A consequence: `end.**Next**` renders as "end.Next" and counts as one word, as Word would count it.
- Reading time uses 238 words a minute, the average silent reading speed for English non-fiction (Brysbaert, 2019). With a selection, the time is for the selection.
- The footer is on by default, centered under the column. It isn't an ARIA live region, since it changes with every keystroke.

## 2026-09-25: Unit tests with Vitest, logic kept in plain modules
- Vitest, because it reuses the Vite config and `$lib` alias, and runs TypeScript without a separate build. Tests run in Node, not jsdom, so the tested code can't depend on the DOM, and pure modules stay pure.
- Logic moves out of `+page.svelte` to be tested (task ticking is now `editor/tasks.ts`), rather than testing Svelte components. Component and end-to-end tests would need a Tauri webview driver, which isn't worth it yet.
- Every new feature and fix comes with tests (AGENTS.md, architecture.md).

## 2026-09-25: Find uses CodeMirror's search with our own find bar, and each OS's shortcuts
- `@codemirror/search` provides the query state, match highlighting and find/replace commands. Its default panel looks like a web form, so `createPanel` mounts `FindBar.svelte` instead (W-022).
- macOS gets a TextEdit/Safari-style find bar under the title bar, and Windows gets a Notepad-style flyout at the top right. Each OS's menu follows its own convention. On macOS that is the Edit → Find submenu with ⌘F, ⌥⌘F, ⌘G, ⇧⌘G and ⌘E. On Windows it is Find/Find Next/Find Previous/Replace in Edit with Ctrl+F, F3, Shift+F3 and Ctrl+H. Windows uses F3, not Ctrl+G, because Ctrl+G is Go To in Notepad and Word.
- Searches are literal and ignore case. Options (match case, whole word) are left to W-046.

## 2026-09-26: CodeMirror draws the caret and selection, not WebKit
- With the native caret, deleting a fence's backticks left a second, stale caret painted at the old spot, sometimes until something else repainted it (`Inspiration/cursor.png`). The text updated at once and the main thread was idle (Web Inspector timeline). Changing the line's syntax makes CodeMirror replace the line's DOM, and WebKit doesn't erase the caret it had drawn there.
- `drawSelection()` draws both as DOM in the same update as the text, so they can't lag. The trade-off is a less native caret: its colour, width (2px) and blink (CodeMirror's 1.2s cycle) are ours to match. Typing, IME and the clipboard stay native (spell checking has since moved to the editor for a similar reason, W-057). Tried and rejected: keeping the native caret and re-setting the DOM selection whenever a redraw removed the caret's node (what CodeMirror's `forceSelection` does for Chrome and iOS). WebKit redrew the new caret but still left the stale one.

## 2026-09-25: Editor code highlighting is muted, not a second palette
- W-045 reuses preview's `--code-*` colours mixed 45% with `--text-muted` (`color-mix` in `editor/setup.ts`), rather than its own tokens, so the two views stay recognisably the same and one palette change moves both. Comments aren't italic in the editor, and headings or invalid code aren't styled, to keep the column calm.
- It's a View menu toggle rather than always on, because focused editors' editor never colours code and most documents here are prose.

## 2026-09-25: Code blocks are highlighted in preview only, with Lezer parsers
- focused editors doesn't highlight code; Typora does. Awen highlights in preview, print and exports, where code is read and shared, and leaves the editor calm. Muted editor highlighting is W-045 and off by default.
- Lezer parsers (`@codemirror/language-data`) rather than highlight.js or Shiki: the editor already uses Lezer, so W-045 can share the same parsers and `--code-*` colours and the two views match. language-data also gives ~150 languages, loaded on demand as separate chunks.
- The cost is that loading is async while markdown-it is sync, so callers await `loadCodeLanguages` before rendering (see architecture.md).

## 2026-09-25: Local images load through the asset protocol, scoped to document folders
- The preview rewrites image paths to `asset:` URLs instead of reading files into data URIs through a command. This avoids an IPC round trip per image and keeps the rendered HTML small.
- The scope starts empty. Each opened or saved document's folder is added recursively, from Rust, where document paths are recorded. The webview can't widen the scope itself, so even a compromised preview can only read those folders. `../` images outside the folder don't load; allowing parents would expose too much (for example the whole home folder).
- HTML export keeps relative paths (see the export decision below), so it only resolves images when saved beside the document.

## 2026-09-25: Ticking a task in preview edits the hidden editor; undo works in preview
- A click on a preview checkbox changes that one character in the editor's document through a normal CodeMirror transaction, so dirty tracking, undo and saving need nothing extra. The preview isn't re-rendered: the box has already flipped itself, and the click is cancelled if the source line doesn't look like a task.
- Each tick is its own undo step (`isolateHistory`), so Cmd+Z after ticking several boxes steps back one box at a time.
- Undo and Redo used to do nothing in preview. They now apply to the document and re-render the preview, because otherwise Cmd+Z right after ticking a box would seem broken.

## 2026-09-25: Opening from Finder/Explorer reuses a blank window; single instance on Windows
- A file opened from outside the app goes to an untitled window with no changes if there is one, as TextEdit does. Otherwise it follows the Open rules (bring forward, or a new window). Otherwise launching Awen by double-clicking a file would show the file *and* an empty Untitled window.
- Rust decides this itself instead of forwarding to the focused window like Open Recent does. The frontend drops file commands while `busy` (e.g. a dialog is open), and a Finder open must never be dropped.
- Windows uses `tauri-plugin-single-instance` so Explorer opens reach the running app. Without it every double-click starts a separate Awen process, and "already open → bring forward" and Quit would only see that process's windows. It is a Windows-only dependency: macOS LaunchServices already keeps one instance.
- Only `.md` and `.markdown` are registered. The Open dialog also accepts `.txt`, but claiming every text file would be intrusive.

## 2026-09-25: Locked means Finder's locked flag, and locking saves first
W-043 uses the file's user-immutable flag (`NSURLIsUserImmutableKey`), the same one Finder's Get Info → Locked sets, rather than an app-private setting, so the lock protects the file everywhere and a lock set in Finder shows in Awen. Locking with unsaved edits saves them first, so what's locked is what's on screen. Editing a locked document offers Duplicate (default, as it keeps the file safe) or Unlock, like TextEdit.

## 2026-09-25: Our own title popover for rename/move/tags
NSDocument apps get the title-bar rename popover for free, but it belongs to NSDocument and the window's own title, which the Overlay title bar hides. So Awen builds an equivalent NSPopover with objc2 (`rename.rs`) and anchors it to the web title, instead of adopting NSDocument. Locked is left for W-043: it needs a read-only editor state. Windows has no equivalent convention, so it keeps Save As only.

## 2026-09-25: One window per document; the Mac app outlives its windows
Following TextEdit and focused editors: New and Open always make a new window. The exception is an untouched Untitled window, which Open reuses, as NSDocument apps do. On macOS closing the last window leaves the app running. Windows keeps its convention of exiting. Rust owns window creation and the label → path map, so it can open files with no window present (needed for Dock reopen and later for open-with, W-023) and bring an already-open file forward. Quit closes windows one by one so each can prompt, rather than using a single "Review changes" dialog.

## 2026-09-25: Open Recent is our own list, not NSDocumentController
The app isn't NSDocument-based, so AppKit's automatic Open Recent menu isn't available. Rust keeps the list and builds the submenu itself, which also works unchanged on Windows. Adding entries to the system recents (Dock menu, `noteNewRecentDocumentURL:`) only makes sense once Awen registers as a `.md` handler and handles open-file events (rest of W-023).
- Update (W-040): now that it does, our list stays the source of truth for the menu and is *mirrored* into the system list, not replaced by it. The Windows Clear Menu uses `RemoveAllDestinations` rather than `SHAddToRecentDocs(…, NULL)`, which would clear the user's recent files for every app.

## 2026-09-25: Title bar toolbar; custom title bar on Windows
- Preview gets a play button in the title bar, like focused editors. The button, shortcut and menu item all call the same `togglePreview()`. View → Preview is a `CheckMenuItem`, synced from the frontend's state.
- **Windows:** turns off native decorations (`tauri.windows.conf.json`) and draws its own title bar with Segoe Fluent Icons caption buttons, since the native title bar has no room for app buttons.
  - This loses the Windows 11 Snap Layouts flyout on hovering maximize (tracked as W-037).
  - `tauri-plugin-decorum` would provide it, but was rejected: no release since 2024-09.
- **macOS:** keeps the Overlay title bar; the button sits in our existing header.

## 2026-09-25: AGENTS.md is the shared instruction file
`AGENTS.md` and `docs/agents/` serve as memory for Claude Code and Codex alike. Each `CLAUDE.md` contains only `@AGENTS.md`. Symlinks were rejected because the project must also be checked out on Windows.

## 2026-09-25: Export dialog is native per OS; PDF is written directly
- **macOS:** an NSSavePanel sheet with an "Export To" popup, like focused editors (`Inspiration/export.png`). The Tauri dialog plugin can't add accessory views, so it is built with objc2 in `src-tauri/src/export.rs`.
- **Windows:** the native equivalent is the "Save as type" list, which the dialog plugin already supports.
- **PDF** goes straight to the chosen file instead of through the print dialog. Print… remains a separate command.
- Only HTML and PDF are offered for now. Word and Project Archive, from the reference image, are not offered yet.

## 2026-09-25: HTML export is one self-contained file
The CSS and fonts are embedded, so the file looks right anywhere. That size (~235 KB) is accepted. Relative image paths are left as-is, so they resolve when the export is saved next to the Markdown file.

## 2026-09-24: Replace-style preview, not a side panel
It matches focused editors' focused feel, it is the only layout that works at phone width, and it avoids live re-rendering and scroll sync. Position is matched once per toggle via `data-line`.

## 2026-09-24: markdown-it with `html: false`
The webview has access to Tauri's backend (IPC), so a document must not be able to inject HTML or scripts. The default `validateLink` already blocks `javascript:` URLs, so no sanitizer is needed. Don't enable `html` without adding sanitization.

## 2026-09-24: Task lists via `markdown-it-task-lists`
It works with markdown-it 14. `@hedgedoc/markdown-it-task-lists` has types but crashes (see gotchas.md). Checkboxes are custom-drawn in CSS for consistency across webviews.
- Superseded in part (W-012, 2026-09-25): checkboxes are now clickable in the in-app preview. They stay disabled in print and exports.

## 2026-09-23: Custom Undo/Redo menu items
A native accelerator for Cmd+Z swallows the keystroke before CodeMirror sees it. The menu items call CodeMirror's history instead.

## 2026-09-23: Vibrancy/Mica deferred
Window translucency needs a transparent window and `macOSPrivateApi`, which blocks Mac App Store distribution. It will be revisited with the sidebar work.

## 2026-09-23: Headless components + per-OS tokens for native look
The native look comes from Bits UI (headless) + Tailwind, with `data-os` selecting mac or windows token files. There is no single component kit, because none looks native on both macOS and Windows. Konsta UI is planned for mobile.

## 2026-09-23: Tauri 2 + SvelteKit SPA + CodeMirror 6
- **Tauri** was chosen over Electron and Flutter: it uses the system webview (small binary, native menus and dialogs) and targets desktop and mobile from one codebase.
- **SvelteKit** runs as a static SPA because there is no server.
- **CodeMirror 6** provides decoration-based styling, needed for dimmed Markdown marks, hanging headings, and future focus/typewriter modes.

## 2026-09-23: Repo hygiene
- `package-lock.json` and `Cargo.lock` are committed, because this is an app and builds must be reproducible.
- There is one root `.gitignore`.
- `src-tauri/gen/schemas` is ignored because it is regenerated. `gen/android` and `gen/apple` will be committed once created.
- Signing keys are always ignored.

## Roadmap
Planned work is tracked as user stories in `docs/backlog.md`.
