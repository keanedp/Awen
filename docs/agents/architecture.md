# Architecture

How the parts of Awen connect. File-level detail is discoverable from the code; this covers the flows that span several files.

## Shape of the app

- **Frontend: a static SPA.** It uses SvelteKit with adapter-static and `ssr = false` (`src/routes/+layout.ts`). Every document window loads the same page. One route, `src/routes/+page.svelte`, owns its window's:
  - the document state: `path`, `dirty`, `savedText`;
  - file actions and the unsaved-changes prompt;
  - preview toggling, export and print.
- **Backend: thin Rust commands** plus native menus and platform code. Frontend wrappers for every command live in `src/lib/files.ts`.

## Tests

- **Vitest** runs `src/**/*.test.ts` (and `scripts/**/*.test.ts`) in Node, with no DOM or Tauri (`npm test`). Its config is the `test` key in `vite.config.js`, so `$lib` imports resolve. Test files sit next to the module they test.
- **Rust** unit tests go in a `#[cfg(test)] mod tests` at the bottom of the file they test and run with `cargo test`. `#[cfg(windows)]` code can't be tested here (see gotchas.md).
- **Every feature or fix ships with tests for its logic.** The story's acceptance criteria are the checklist: each one that can be checked without a window gets a test. Put new logic in a plain module (like `editor/tasks.ts`), not in `+page.svelte` or a component, and keep the page to wiring (dispatching, focus, dialogs). If existing logic you're changing is still in the page, move it out first.
- What tests can't cover (native menus, dialogs, WebView rendering, print/PDF, platform code) is still verified by running the app, and the story stays `Needs verification` until it has been.
- Covered so far:
  - `editor/setup.test.ts`: line endings round trip, and pasted text takes the file's line endings.
  - `editor/tasks.test.ts`: task ticking, from a preview checkbox's `data-line` to the source edit.
  - `preview/transition.test.ts`: the preview's fade, with and without Reduce Motion.
  - `preview/render.test.ts`: raw HTML and `javascript:` links never survive rendering; highlighted code is escaped; `localImage` path resolution, including Windows paths (mocks `convertFileSrc`).
  - `files.test.ts`: path helpers and the export dialog's default path and chosen format.
  - `editor/count.test.ts`: word counting (Markdown syntax left out, selections, hyphenated words) and the footer text.
  - `editor/code.test.ts`: editor code highlighting (fences parsed only when on, preview's language names and classes, Markdown never styled as code, word count unchanged).
  - `preferences.test.ts`: saved values are checked and fall back to defaults (mocks `invoke` and `listen`).
  - `settings.test.ts`: text size steps (Bigger / Smaller stop at the ends), the writing tokens each setting sets, and which View commands change which preference.
  - `editor/setup.test.ts` also covers spell checking on, off and switched in an open editor, with WebKit's own checking left off.
  - `editor/format.test.ts`: every Format menu command (W-060): wrapping and unwrapping, selections and carets, multi-line and mixed selections, CRLF files, a single undo step. `preview/render.test.ts` covers `==highlight==`.
  - `editor/focus.test.ts`: focus mode's sentence and paragraph at the caret or selection (line ends, blank lines, CRLF), the dimmed ranges following edits, nothing dimmed when off. `settings.test.ts` covers the Focus menu commands.
  - `editor/typewriter.test.ts`: the caret centerd after typing, keyboard moves and selections; no scroll mid-drag or when off; the padding applied and removed with the mode, and turning it off leaving the caret and scroll alone. `settings.test.ts` covers which of dimming or typewriter each focus unit turns on (`activeFocus`).
  - `editor/spelling.test.ts`: what the spell checker sees (code, URLs, link labels, HTML blanked; offsets stay document positions in CRLF files), marks surviving edits elsewhere, an edited word unmarked, a word at the caret waiting until the caret moves on, corrections.
  - Rust: `rename.rs` (create and move never overwrite, case-only renames, name checks, using a temporary folder), `recent.rs` (list order and limit, menu labels), `preferences.rs` (missing or corrupt file, round trip, theme values), `documents.rs` (which labels are document windows) and `spelling.rs` (macOS only: misspellings at UTF-16 offsets, suggestions).
- Test logic, not glue: when a Tauri command mixes file work with app state, split the file work into a plain function (`rename::move_file`, `recent::move_to_top`) and test that.
- A known bug gets a `test.fails` with its story ID, so the suite goes red once it's fixed and someone flips it to `test`.
- Test through the extension the editor actually registers (e.g. run text through `state.facet(EditorView.clipboardInputFilter)`), not a copy of its logic, so the test fails if the extension is dropped from `createState`.

## Menu → event → action

1. `src-tauri/src/menu.rs` builds the native menus.
2. When a menu item whose id is in `FORWARDED` is clicked, `lib.rs` emits a `menu` event with the id as its payload **to the focused window only** (`documents::emit_to_focused`). That may be the Settings window, which handles Close and the View commands that set preferences and ignores the rest. Open and Open Recent go only to a focused *document* (`emit_to_focused_document`); otherwise Rust handles them.
3. `+page.svelte` listens with `appWindow.listen` (not the global `listen`, which would hear every window's events) and dispatches through its `actions` map.

Details:
- File actions are serialized by a `busy` flag. Undo/redo, find, Preview and Word Count bypass it (the `immediate` set) so they stay responsive.
- Undo/redo are custom menu items rather than `PredefinedMenuItem`s. They call CodeMirror's `undo`/`redo` (see decisions.md).
- Close calls `appWindow.close()`. `onCloseRequested` runs `confirmDiscard()` (Save / Don't Save / Cancel) and can prevent the close.
- New, Quit and Settings… never reach the frontend (see Document windows and Settings window). Open does, unless no document is focused; then Rust shows the Open dialog itself.
- On macOS, Quit lives in the app menu; on other OSes, File has Exit.
- **Checkmarks** (View → Preview, Focus Mode, Focus On ▸ Sentence / Paragraph / Typewriter, Word Count, Code Highlighting) are `CheckMenuItem`s kept by id in `menu::CheckItems`. The menu bar is app-wide but the state is the frontend's, so a window restates them with `setMenuChecked(id, …)` (`set_menu_checked`) whenever the state changes and when it comes forward. A new check item needs adding to `CheckItems` and to the `id` type in `src/lib/menu.ts`.

## Preferences (`src/lib/preferences.ts`, `src-tauri/src/preferences.rs`)

- App-wide settings kept between launches (W-020): `wordCount`, `codeHighlighting`, `focusMode`, `focusUnit` (sentence, paragraph or typewriter) and `exportFormat`, plus the settings window's (W-021) `textSize`, `columnWidth`, `lineSpacing`, `spellcheck` and `theme`.
- Rust stores them as untyped JSON in `preferences.json` in the app data folder, beside `recent.json`, loaded in `setup`. The frontend owns names, types and defaults: `parsePreferences` checks every saved value and falls back to the default, so an old, newer or hand-edited file can't break the app.
- `setPreference(key, value)` saves and emits `preference-changed` to every window. Each page listens with the global `listen` (deliberately, unlike menu events) and applies it to its `prefs` state, so all windows follow a change made in one.
- A new window renders with defaults until `loadPreferences()` resolves. Anything a preference hides waits for `prefsLoaded`, so it doesn't flash up.
- To add a preference: add it to `Preferences`, `defaults` and `valid` in `preferences.ts`, with a test. Nothing changes in Rust.
- **Theme** is the exception: Rust applies it (`preferences::apply_theme`, calling `AppHandle::set_theme`) when it loads the file in `setup` and whenever it changes. The theme belongs to the app: on macOS it sets `NSApp.appearance`, so menus, dialogs and every webview's `prefers-color-scheme` follow it, windows opened later included. CSS keeps using `prefers-color-scheme`; nothing in the frontend reads `theme`.
- **Writing tokens:** `writingStyle(prefs)` (`settings.ts`) turns text size, column width and line spacing into `--writing-size`, `--measure` and `--writing-line-height`, set inline on `.app-root`. Not on `:root`, so the print copy (outside `.app-root`) and HTML export keep the paper defaults.
- View → Bigger / Smaller / Actual Size and the Word Count / Code Highlighting toggles go through `viewChange` (`settings.ts`), which both document windows and Settings use. They update the local `prefs` first, so a held-down shortcut steps from the new value rather than waiting for `preference-changed`.
- Window size and position are not preferences: the window-state plugin restores them, for the `main` window only.

## Document windows (`src-tauri/src/documents.rs`)

- One document per window. Rust creates windows from the `tauri.conf.json` window config (so per-OS settings apply) and keeps a map of window label → file path.
  - The first window is `main`, the only one the window-state plugin remembers. If `main` is closed, the next new window takes the label back. Others are `doc-N`, cascaded 22pt from the focused window.
- **Opening** (`open_path`): brings forward the window already showing the file; otherwise reads it in Rust and loads it into the asking window if that is an untouched Untitled document (`reuse`), or else into a new window. A new window collects its text on mount with `take_initial_document`. Rust notes/forgets Open Recent entries here; the frontend only notes Save As, and reports the new path with `set_document_path`.
- **Closing the last window:** `RunEvent::ExitRequested` without a code is prevented on macOS, so the app stays in the Dock; `RunEvent::Reopen` (Dock click) opens a new window. On Windows the app exits.
- **Quit** sets a `quitting` flag and closes windows one at a time (focused first). Each window's close handler may prompt; after each `Destroyed` event Rust closes the next, and exits when none are left. Cancel calls `cancel_quit`, which ends the sequence.
- **System quit requests** (Dock → Quit, logout, restart) go through `src-tauri/src/terminate.rs`. It adds `applicationShouldTerminate:` to tao's app delegate class at setup, answers `NSTerminateLater`, and runs the same Quit sequence. The end of the sequence calls `replyToApplicationShouldTerminate:` (YES when all windows closed, NO on Cancel) instead of `app.exit`. While that reply is pending, the last window closing doesn't exit the app by itself.
- The dot in the macOS close button follows `dirty` via `set_document_edited`.
- Settings is not a document window: `documents::is_document` (`main` or `doc-N`) keeps it out of blank-window reuse, cascading and Open. Quit still closes it along with the rest; the Dock click reopens a document when only Settings is open.
- The View → Preview checkmark is app-wide, so each window restates its own state when it gains focus.

## Settings window (`src-tauri/src/settings.rs`, `src/routes/settings/+page.svelte`)

- One app-wide window, label `settings`, opened by the `settings` menu item (Awen → Settings… on macOS, Edit → Settings… on Windows), handled in Rust. A second click brings it forward.
- It loads the `/settings` route. Tauri serves the SPA fallback `index.html` for it, and SvelteKit routes it client-side. Its permissions are in `capabilities/settings.json`.
- Rust builds it hidden and fixed-size, with native decorations on both OSes (no custom title bar). On macOS it uses the Overlay title bar style, like document windows: the page runs under the title bar (top padding of `--titlebar-height`, plus a `data-tauri-drag-region` strip), so `setSize` and the page's height measure the same thing. The page loads the preferences, waits for fonts, sets the window's height to its content (`setSize`), then shows and focuses it, so it never jumps or flashes defaults. A `ResizeObserver` refits it if the content's height changes later, since a single measurement right after the first render came out short.
- Controls are Bits UI wrapped in `src/lib/ui/`: `Toggle` (Switch), `Choice` (Select; its menu is portalled to `<body>`, so its styles are global) and `Slider` (with a tick per stop). Each is styled per OS with `[data-os]` selectors and tokens: `--menu-*`, `--settings-bg`, `--group-*` and, on Windows, `--text-on-accent`.
- Every control calls `setPreference`; document windows apply the change through `preference-changed` like any other preference. Settings also restates the Word Count and Code Highlighting checkmarks, since it may be the only window open.

## Opening files from outside the app (`documents::open_external`)

- **Registration:** `bundle.fileAssociations` in `tauri.conf.json` (`.md`, `.markdown`, UTI `net.daringfireball.markdown`, role Editor). The bundler turns it into `CFBundleDocumentTypes` on macOS and registry entries in the Windows installers.
- **How files arrive:**
  - macOS: `RunEvent::Opened` with `file://` URLs (Finder double-click, Open With, drop on the Dock icon), handled in `lib.rs`'s run loop.
  - Windows (and Linux): as command-line arguments. `setup` reads them at launch. Later launches are caught by `tauri-plugin-single-instance`, which passes the second process's arguments and working directory to the running app.
- **Launch ordering:** AppKit can deliver `Opened` before `applicationDidFinishLaunching`, i.e. before Tauri's setup has created `main` or managed `Recent`. `open_external` queues paths until `finish_launching` (called at the end of `setup`) opens them.
- **Which window:** each file first goes to a *blank* window (untitled, no unsaved changes, no document pending), preferring the focused one, so launching Awen by double-clicking a file doesn't leave an extra Untitled window. Otherwise `open_path` brings forward or opens a new window.
  - If the blank window's page hasn't mounted yet, the text goes into `pending` for `take_initial_document`; if it has, Rust emits `load-document` to it.
  - Rust tracks `ready` (the page called `take_initial_document`) and `edited` (from `set_document_edited`) to decide this. The `ready` lock is held across the decision, so a window can't mount in between.
  - The page registers its event listeners *before* calling `take_initial_document`, so a `load-document` sent after that call is never missed.

## Open Recent (`src-tauri/src/recent.rs`)

- Rust owns the list (max 10, newest first), stored as a JSON array of paths in `<app data dir>/recent.json`, and rebuilds the File → Open Recent submenu whenever it changes.
- Document items have the id `recent:<full path>`. Clicking one emits an `open-recent` event with the path (not a `menu` event) to the focused window, which opens it through the same `busy` guard as other file actions. With no window open, Rust opens it directly. Clear Menu is handled entirely in Rust.
- Rust notes a file when it opens and forgets one that fails to open (moved or deleted). The frontend calls `noteRecentDocument` when Save As writes to a new path.
- Labels are the file name, with ` — folder` added when two entries share a name, as macOS does.
- `note` and `clear` also update the system's recent documents (`recent::system`, on the main thread): `NSDocumentController` on macOS feeds the Dock menu; `SHAddToRecentDocs` and `IApplicationDestinations::RemoveAllDestinations` on Windows feed the Jump List. Picking one arrives as an ordinary external open (`RunEvent::Opened` / a second process forwarded by single-instance), so no extra handling is needed. `forget` doesn't touch the system list.

## Editor (`src/lib/editor/`)

- `setup.ts` creates a fresh `EditorState` per document. Loading a document into an existing window calls `view.setState(createState(...))` instead of recreating the `EditorView`.
- Line endings: `EditorState.lineSeparator` is set to the separator detected in the file, and `documentText(view)` returns `state.sliceDoc()`. Together these make a round trip byte-identical. Always read text through `documentText()`.
  - With the separator set, CodeMirror splits inserted text only on that separator. So a `clipboardInputFilter` (`matchLineBreaks`) converts pasted and dropped text to the file's line ending (W-050). Any other path that inserts outside text must do the same.
- `markdownStyling.ts` dims syntax marks via a `HighlightStyle` (`--markup` color). A `ViewPlugin` gives each heading line with a leading `#` marker a `.cm-hanging-heading` line decoration and `--hang` (the marker's length in characters, from `hangingHeadings`). The theme turns that into a negative `text-indent` of `min(--hang ch, room beside the column)`: in a wide window markers hang whole and headings line up with body text; in a narrower one they hang only as far as the space beside the column, pushing the heading text in; when the column fills the window, nothing hangs. The room comes from `100cqw` (`.cm-scroller` is an inline-size container) and `--measure`, so it needs no JavaScript measuring. Continuation lines of a wrapped heading aren't indented, since `text-indent` only moves the first line.
- **Word count (W-019):** `count.ts` counts words with `Intl.Segmenter`, after blanking the Markdown syntax nodes (marks, URLs, images, HTML tags; see the `syntax` set) in the editor's own parse tree. `createState`'s `onSelect` hook schedules a recount 150ms after typing or selecting stops; the whole document is only recounted when `state.doc` changed. Nothing is counted while the footer is hidden. The footer is `src/lib/ui/WordCount.svelte`; in preview it shows the whole document, since the selection is hidden.
- **Code highlighting (W-045):** `code.ts` holds the Markdown language in a compartment. Off, fences are plain `CodeText`; on, `markdown({ codeLanguages })` parses them with the same lookup (`codeLanguage`) and `hl-*` classes (`codeHighlighter`) as preview, loading parsers on demand. The highlighter is scoped to non-Markdown trees, since tags like `heading` and `processingInstruction` also mark Markdown. `setup.ts`'s theme mutes the colors by mixing each `--code-*` token (now on `:root`) with `--text-muted`. Code parsed this way is mounted as nested trees: `count.ts` and the hanging-mark plugin iterate with `IterMode.IgnoreMounts` (see gotchas.md).
- **Focus mode (W-017):** `focus.ts` holds a `StateField` in a compartment (`setFocusMode`) that marks everything outside the sentence or paragraph at the main selection `.cm-unfocused` (opacity `--unfocused-opacity`). A paragraph is the Markdown block at the caret (the `blocks` set), from the parse tree without entering mounted code trees. It is recomputed on every edit, selection change and parse update. `setFocusMode` restores the scroll position after switching, which WebKit otherwise moves (see gotchas.md). The page turns it on from `activeFocus(prefs).dim`; preview and exports never see it, as it lives only in the editor.
- **Typewriter scrolling (W-018):** focus mode's Typewriter unit (`activeFocus(prefs).typewriter`). `typewriter.ts`, in a compartment (`setTypewriterScrolling`). A `transactionExtender` adds `scrollIntoView(head, { y: "center" })` to every transaction flagged `scrollIntoView`; CodeMirror lets a scroll effect override the flag's "nearest" scroll. Mouse selections don't set that flag, so a `mousedown` handler centers the caret on the next `mouseup` on `window`, after CodeMirror's own `document` listener has finished the selection. A `ViewPlugin` measures half the scroller's height less half a line (again on geometry changes) and dispatches it (`setInset`) with a centering scroll; a `StateField` turns it into `.cm-content`'s top and bottom padding through `contentAttributes`, so the first and last lines reach the middle. Turning typewriter off (or switching to Sentence / Paragraph) drops the field; `setTypewriterScrolling` measures how far the caret's line moved and scrolls it back in the next measure, before the frame is drawn, so the line stays where it was on screen unless the start or end of the document is too close.
- **Caret and selection** are drawn by CodeMirror (`drawSelection()`, see decisions.md), styled with `--caret`, `--selection` and `--selection-inactive` (unfocused). Native `::selection` is hidden in the editor; preview still uses it.
- **Spell checking (W-057):** `spelling.ts` marks misspellings as `.cm-misspelled` decorations (a `StateField`), not with WebKit's checking, whose marks CodeMirror's redraws wipe (see gotchas.md). CodeMirror's default `spellcheck="false"` stays on the content.
  - A `ViewPlugin` checks the viewport's lines 400ms after typing, scrolling or moving the caret stops. `checkableText` blanks code, URLs, link labels, HTML and entities with spaces, keeping the length, so the checker's offsets plus `from` are positions. A result arriving after the document changed is dropped.
  - Marks map through edits; a mark touching an edit is dropped until the next check. A new misspelling with the caret in or at the end of it isn't marked yet (still being typed), as in native text views.
  - The checker comes from the `spellChecker` facet: `spellchecker.ts` in the app (Tauri commands in `spelling.rs`, main thread, UTF-16 offsets), a fake in tests. Settings → Check spelling while typing swaps the extension in or out of a compartment.
  - Right-clicking a marked word selects it and shows a native menu (Tauri's JS `Menu`, `popup()`): suggestions, Ignore / Learn Spelling (Windows: Ignore / Add to dictionary), Cut / Copy / Paste. Elsewhere the web view's own menu shows.
  - Ignore lasts until quit, in every window: one spell document tag on macOS, one kept `ISpellChecker` on Windows. Other windows drop the mark on their next check.
- Layout: a centered column (`max-width: var(--measure)`, 66ch) with bottom padding of 40vh, so the end of the text can scroll up the screen.
- **Format menu (W-060):** `format.ts` turns each Format menu item (ids `format_*`) into a transaction on `view.state`: inline styles wrap or unwrap each selection, line styles rewrite the markers at the start of each selected line, Code Block and Clear Styles read the syntax tree. `format()` in `+page.svelte` dispatches it with `isolateHistory`, so each is one undo step. New lines are inserted with `state.lineBreak`.
  - The menu bar is app-wide, so the items are disabled per window: each document window calls `setFormatEnabled(!previewing && !locked)` when either changes and when it comes forward, and Settings disables them when it comes forward. Rust keeps the items in `menu::FormatItems`.
- **Find (W-022):** `find.ts` adds `@codemirror/search` with a `createPanel` that mounts `src/lib/ui/FindBar.svelte` (Svelte `mount`) as a top panel.
  - The bar dispatches `setSearchQuery` as you type. Menu items call `openFind`, `findNext` and the other commands in `+page.svelte`; find leaves preview first.
  - CodeMirror highlights matches only while the panel is open. Find Next/Previous still work after the bar closes, using the last query.
  - The panel container is sticky at the top of the editor. The macOS bar takes up layout space in it. The Windows flyout is absolutely positioned inside it, so it floats over the text.

## Rendering (`src/lib/preview/render.ts`)

- There is one markdown-it instance, shared by preview, print, PDF and HTML export. Settings: `html: false`, `linkify`, `typographer`, plus `markdown-it-task-lists` and `markdown-it-mark` (`==highlight==`).
- `renderMarkdown(text, { preview: true })` is used only by the in-app preview. It adds `data-line="<0-based source line>"` to block tokens (for scroll matching and task toggling) and removes `disabled` from task checkboxes. Exports and print omit both.
- **Code highlighting (W-044):** markdown-it's `highlight` option calls `src/lib/preview/highlight.ts`, which parses each fenced block with the Lezer parser from `@codemirror/language-data` and emits escaped text in `hl-*` spans (colors: `--code-*` tokens in `preview.css`, so export and print get them too). Parsers are code-split and loaded asynchronously, but markdown-it renders synchronously, so every caller awaits `loadCodeLanguages(text)` first: `togglePreview`, print and PDF (`codeLanguages()` in `+page.svelte`) and `exportHtml`. A language that isn't loaded yet renders as plain code.
- **Local images (W-033):** `renderMarkdown(text, { folder })` rewrites relative and absolute image paths to asset-protocol URLs (`convertFileSrc`), resolved against the document's folder. Preview, print and PDF pass `folder` (via `render()` in `+page.svelte`); HTML export does not, so its paths stay relative to where it is saved. The asset scope starts empty (`tauri.conf.json`); `documents::allow_images_beside` adds each opened or saved document's folder, recursively, so `../` paths outside it are blocked. Print and PDF wait for the images to decode first. An image that fails to load (missing, outside the scope, or blocked by the CSP) is swapped for a `.missing-image` span with its alt text by a capture-phase `error` listener in `+page.svelte`, because WebKit otherwise draws a broken-image icon.

## Preview (replace-style)

- `togglePreview()` in `+page.svelte` works in two directions:
  - **Into preview:** reads the editor's top visible line, renders, and mounts `Preview.svelte` in place of the editor.
  - **Back to the editor:** asks the preview for its top `data-line` and scrolls the editor there.
  - When the first block is at the top, both directions scroll to the very top instead, so the view's top padding stays visible. Scrolling to the first line alone would hide it.
- The `EditorView` stays mounted, so undo history, selection and scroll survive. It stays laid out under the preview too: the preview is an opaque layer on top, which lets the two dissolve into each other (`preview/transition.ts`, W-068). While previewing, the editor is `inert`; once the fade-in ends (`covered`) it is also `invisible`, so it stops painting.
- Leaving preview scrolls the editor *before* `previewing` goes false, so the fade-out reveals it already in place; focus waits a `tick()` for `inert` to come off.
- `Preview.svelte` intercepts every link click:
  - `#anchor` links scroll within the preview;
  - http(s)/mailto links open via `@tauri-apps/plugin-opener`;
  - nothing ever navigates the webview.
- Esc also exits.
- **Ticking a task (W-012):** the click passes its `li`'s `data-line` to `toggleTask()` in `+page.svelte`, which flips `[ ]`/`[x]` on that line of the hidden editor. Undo/Redo in preview run on the editor and re-render `previewHtml`.

## Print, PDF and HTML export

- **Print copy.** `+page.svelte` renders the document into a hidden `<div class="print-root">`. Under `@media print`, `app.css` hides `.app-root` and shows only `.print-root`.
- **Paper typography.** The `@media print` block in `preview.css` sets black on white, full width, and page-break rules.
- **Wide tables in print** (`src/lib/preview/fit-tables.ts`). The print copy's `<article>` has the `paper` class, and `.print-root` is a size container, so `100cqi` is the page width. Once the copy's images have loaded, `fitTables` lays each table out in an offscreen probe and sets `--table-ems` (all cells on one line) and `--table-min-ems` (no word broken) in the table's own ems. CSS then picks the font size: one line per cell if that's 8pt or more, else 8pt with wrapping between words, else down to 6pt. The page width isn't known until the print layout, so the comparison has to happen in CSS. `fitTables` also writes a `@container` rule per table (`<style id="fit-tables">`) that lets links and code break only when the table is wider than the page even at 6pt. `.paper` rules sit outside `@media print` so the probe matches the print layout. HTML export doesn't use `.paper`; printed from a browser, its tables only wrap.
- **Print… (Cmd+P).** Renders the print copy, then calls the `print_page` command, which opens the system print dialog.
- **Export… (Cmd+Shift+E):**
  - `pickExportTarget()` in `files.ts` returns `{ path, format }`.
    - On macOS it calls `choose_export`: a native NSSavePanel sheet with an "Export To: HTML/PDF" popup.
    - On other OSes it uses the dialog plugin's save dialog, with HTML/PDF filters ("Save as type") and the format taken from the extension.
  - **PDF:** renders the print copy, then `export_pdf` prints the page straight to the file. This does not go through the print dialog.
  - **HTML:** `src/lib/export/html.ts` builds a single self-contained file. It includes `preview.css` imported via `?raw`, and its own light/dark tokens, including a cross-platform system font stack. No fonts are embedded, so it shows in the reader's system font.
- The export format last used is a preference (`exportFormat`), so it's remembered between launches.

## Theming

- `platform.ts` sets `<html data-os="mac|windows|linux">`.
- `app.css` defines the shared tokens and light/dark defaults. `tokens.mac.css` and `tokens.windows.css` override them per OS: UI font, sizes, radii, accent, surfaces, scrollbars.
  - The accent comes from the OS via `accent_colors` (see gotchas.md). It is re-read whenever the window gains focus, so a change in System Settings shows up when you switch back.
  - Windows follows WinUI's accent roles: `--accent` fills controls (a darker shade in light mode, a lighter one in dark), `--accent-text` colors links and accent glyphs, and in dark mode text on the accent is black (`--check-mark`). macOS uses one color for all of them. Use `var(--accent-text, var(--accent))` for accent-colored text.
- Tailwind v4 exposes the tokens as utilities through `@theme inline` (`bg-surface`, `text-muted`, `font-ui`, `font-writing`, `rounded-control`).
- The writing font (editor, `--font-writing`) is chosen in Settings → Font (`writingFonts` in `settings.ts`): Monaspace Neon by default, Argon or Radon (`static/fonts/monaspace/`, variable, SIL OFL; keep `LICENSE` beside them), or the system monospace. `writingStyle` sets the stack on `.app-root`, like the other writing tokens; `app.css`'s `:root` value is the default. The preview font (preview, print and exports, `--font-preview`) is the system font, set per OS in the token files.
- **Title bar:** `src/lib/ui/TitleBar.svelte`, used by `+page.svelte`.
  - **macOS:** `titleBarStyle: "Overlay"` + `hiddenTitle` puts the traffic lights inline over our draggable header, which shows "name — Edited" centered and toolbar buttons at the trailing edge.
  - **Windows:** `decorations: false` (in `tauri.windows.conf.json`). `TitleBar` draws the whole bar: menu titles, title `*name - Awen`, toolbar buttons, then minimize/maximize/close using Segoe Fluent Icons glyphs. It tracks maximized/focused state to swap the restore icon and dim when inactive.
  - **Menu bar (W-073):** `MenuBar.svelte` draws the titles from `MENUS` in `src/lib/menubar.ts`; a new top-level menu in `menu.rs` needs adding there too. Its keyboard logic (Alt+letter, Alt tap / F10 focus, arrows) is in `menubar.ts`.
    - Opening a menu calls `track_menu_bar` (`src-tauri/src/menubar.rs`) with every title's box. On the main thread it pops up the app menu's submenu (`hpopupmenu`) with `TrackPopupMenuEx`, under the title. A `WH_MSGFILTER` hook watches the menu's loop, and a window subclass follows `WM_MENUSELECT`. The pointer moving onto another title, or Left/Right at the menu's edge, ends the popup and opens the neighbor. It emits `menu-bar` with each title it opens, so the bar shows it pressed.
    - A chosen item is posted to the window as `WM_COMMAND`, where muda's subclass turns it into an ordinary menu event, so it takes the usual path through `on_menu_event`.
    - The command returns the title to keep highlighted when Esc closed the menu, as a native menu bar does.
    - Document windows `hide_menu()` on Windows (`documents::new_window`), so the unseen native bar can't take Alt.
  - Linux keeps native decorations and has no toolbar yet.
  - `appWindow.setTitle()` still runs on every OS, so the taskbar/Dock and Window menu stay right.
- **Title popover (macOS, W-042):** clicking the title, or File → Rename…, opens a native NSPopover (Name, Tags, Where) from `src-tauri/src/rename.rs`.
  - The title is a `<button>` that is *not* a drag region: its own mousedown handler calls `startDragging()` once the pointer moves 3px, and opens the popover on mouseup otherwise.
  - `show_document_info` anchors the popover to the chevron's `getBoundingClientRect()`. The Overlay title bar makes the WKWebView fill the whole window, so CSS pixels map straight onto the web view's coordinates.
  - The command returns only what changed (nothing on Esc). `rename()` in `+page.svelte` applies it: `move_document` (refuses to overwrite; updates the window's path and Open Recent), or `create_document` for an untitled document, then `set_file_tags`. Unsaved edits stay unsaved, as in NSDocument apps.
- **Locked documents (macOS, W-043):** the popover's Locked checkbox sets the file's `NSURLIsUserImmutableKey` flag (Finder's Locked) via `set_file_locked`.
  - The page re-reads the flag (`is_file_locked`) on load, after the popover and whenever the window gains focus, since Finder can change it. `setReadOnly()` in `editor/setup.ts` toggles `EditorState.readOnly` through a compartment; the title shows "— Locked".
  - CodeMirror ignores edits while read-only. A `beforeinput`/`paste`/`drop`/`cut` handler (plus undo/redo and preview task clicks) calls `askToUnlock()`: Duplicate opens an untitled copy (`duplicate_document`, a new window whose initial document has no path, so it starts dirty), Unlock clears the flag.
  - A locked file can't be renamed, moved or re-tagged, so the popover grays those fields out while Locked is ticked, and `rename()` unlocks first and relocks last. Locking a document with unsaved edits saves it first.
- **Toolbar buttons:** `src/lib/ui/ToolbarButton.svelte`, sized by `--toolbar-button-*` tokens.
  - They cancel `mousedown` so they never steal focus from the editor.
  - Toggle buttons pass `pressed`.
  - A toolbar toggle that also has a menu item should use a `CheckMenuItem`, synced from frontend state the way Preview is (see Checkmarks under Menu → event → action).
- **Components:** Bits UI headless components wrapped in `src/lib/ui/`, themed by the tokens (first used by Settings: `Toggle`, `Choice`, `Slider`). Konsta UI is planned for mobile.

## Releases and CI (`.github/`, W-070)
- **Version:** `package.json` holds it; `tauri.conf.json` reads it (`"version": "../package.json"`). `scripts/version.mjs` copies it into `package-lock.json`, `Cargo.toml` and `Cargo.lock` (`set`) and checks they agree (`check`).
- **Cutting a release:** `make release VERSION=x.y.z` bumps, runs the tests, commits and tags `vX.Y.Z` locally. Pushing the tag runs `release.yml`:
  - `prepare` checks the tag against every version copy, then creates a draft release (or reuses it on a re-run);
  - `build` runs `tauri build` per target (macOS arm64, macOS x64 cross-built on the arm runner; Windows x64 is commented out while Windows releases are paused), uploads only the installers (`.dmg`, `-setup.exe`, `.msi`) to that draft with `gh release upload --clobber`, and attests their provenance once the repo is public.
  - Publishing the draft is manual.
- **CI:** `ci.yml` runs on PRs and `main`, on macOS and Windows: tests, svelte-check, frontend build, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`. It's the only place the Windows code gets compiled.
- Actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) bumps them weekly.
