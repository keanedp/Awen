# Backlog

User stories for Awen, grouped by milestone. This file is the single place to track progress, for people and agents alike.

## How to use this file

**Status values** (in each story's `Status:` line):
- `Todo`: not started.
- `In progress`: someone is working on it. Add who or what branch, e.g. `In progress (agent, branch feat/focus-mode)`.
- `Needs verification`: built, but not yet checked by running the app on the stated platforms.
- `Done`: built and verified.
- `Dropped`: decided against. Keep the story and add one line saying why.

**Acceptance criteria** are checkboxes. Tick them as they are met; a story is `Done` only when all are ticked.

**Agents:** when you work on a story:
- update its status when you start and finish;
- tick the criteria you've met;
- add unit tests for the story's logic (see "Tests" in `docs/agents/architecture.md`);
- move it to `Needs verification` if you couldn't run it on every stated platform, and say what's unverified;
- add a new story for any follow-up work you discover (use the next free ID; don't reuse IDs).

Record decisions in `docs/agents/decisions.md`, not here.

**Find open work:** `grep -n "Status: Todo\|Status: In progress\|Status: Needs" docs/backlog.md`

Next free ID: **W-072**

---

## M1: Core editor

### W-001 Write in a calm, centered column
Status: Done · Platforms: macOS, Windows
As a writer, I want a distraction-free editor with a readable column and a good writing font, so I can focus on the text.
- [x] Centered column (~66 characters wide), Classic Mono font, soft line wrapping
- [x] Markdown marks (`#`, `*`, `_`) are dimmed; `#` heading marks hang into the left margin
- [x] Light and dark mode follow the system

### W-002 Open and save Markdown files
Status: Done · Platforms: macOS, Windows
As a writer, I want to open, save and save-as `.md` files with native dialogs, so my writing lives in plain files I own.
- [x] New, Open…, Save, Save As… from the File menu with the standard shortcuts
- [x] Saving preserves the file's original line endings (byte-identical round trip)
- [x] The window title shows the file name and an edited marker in each OS's style

### W-003 Never lose unsaved work
Status: Done · Platforms: macOS, Windows
As a writer, I want to be asked before unsaved changes are discarded, so I never lose work by accident.
- [x] Save / Don't Save / Cancel prompt on New, Open, Close and Quit when there are unsaved changes
- [x] Cancel keeps the window open and the text intact

### W-004 Feel native on each OS
Status: Done · Platforms: macOS, Windows
As a Mac or Windows user, I want the app to look and behave like other apps on my system.
- [x] Native menu bar with platform conventions (app menu and Quit on macOS; Exit in File on Windows)
- [x] macOS: inline traffic lights, draggable title area; Windows: native title bar
- [x] System UI font, accent colour and scrollbar style per OS
- [x] No text selection or web context menu on app chrome

### W-050 Pasting keeps the file's line endings
Status: Done · Platforms: macOS (Windows verification moved to W-052)
As a writer, I want pasted text to use my document's line endings, so a file never ends up with mixed or broken lines.
- [x] Pasting LF text into a CRLF file, or CRLF text into an LF file, gives proper lines in the file's own line ending, with no stray `\r` or `\n` (`matchLineBreaks`, a `clipboardInputFilter` in `editor/setup.ts`)
- [x] Dropped text is normalised too (CodeMirror runs drops through the same filter)
- [x] The paste tests in `src/lib/editor/setup.test.ts` pass as ordinary tests
- [x] Verified in the app: paste CRLF text into an LF file and LF into a CRLF file, save, and check the bytes (e.g. `od -c`) on macOS (`test_files/lf.md` and `crlf.md`)

### W-055 The caret keeps up when editing fences
Status: Needs verification · Platforms: macOS, Windows
As a writer, I want the caret to move as soon as I type or delete, including on code fence lines.
- [x] CodeMirror draws the caret and selection (`drawSelection()`), in `--caret` and `--selection` colours, grey when the editor isn't focused
- [ ] Verified on macOS: deleting and typing a fence's backticks moves the caret at once; caret and selection look right in light and dark mode, while typing, selecting by mouse and keyboard, with the find bar focused, and with the window in the background
- [ ] Verified on Windows

### W-052 Verify pasting line endings on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-050's paste fix to work in a real build.
- [ ] Paste CRLF text into `test_files/lf.md` and LF text into `test_files/crlf.md`, save, and check neither file has mixed endings (e.g. `Format-Hex`, or `git diff` showing no `^M` changes)

### W-048 Follow the system accent colour
Status: Done · Platforms: macOS (Windows verification moved to W-049)
As a writer, I want the app's highlights to use the accent colour I picked in System Settings / Windows Settings, not a fixed blue.
- [x] Accent read natively (`accent_colors`: `NSColor.controlAccentColor` / `UISettings`), since WKWebView reports `-apple-system-control-accent` as blue and WebView2 has no CSS for it
- [x] Used for the pressed Preview button, focus rings (including the preview's top edge), links and checked task boxes, in light and dark mode
- [x] A change in settings shows up when the window next comes forward
- [x] Windows: WinUI accent roles (fill, text, and black on the accent in dark mode) (code written, see W-049)
- [x] Verified on macOS

### W-049 Verify the system accent colour on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want the W-048 accent colours to work in a real build.
- [ ] Compiles on Windows (`accent::win`, never built; needs the `UI` and `UI_ViewManagement` features)
- [ ] Pressed Preview button, links, checked task boxes (black tick in dark mode) and the find field underline follow the Windows accent, in light and dark mode

---

## M2: Focus, preview and output

### W-010 Preview the rendered document
Status: Done · Platforms: macOS, Windows
As a writer, I want to swap to a rendered preview and back with one shortcut, so I can check how the document reads.
- [x] Cmd/Ctrl+R and View → Preview toggle; Esc returns to the editor
- [x] Preview opens at the part of the document I was on, and returns to where I scrolled
- [x] Undo history, cursor and selection survive the toggle
- [x] Links open in the default browser; the app never navigates away

### W-036 Toggle preview from the title bar
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want a play button in the window header, so I can switch to preview without remembering the shortcut.
- [x] Play button at the trailing edge of the title bar; tooltip shows the shortcut
- [x] Button, Cmd/Ctrl+R, View → Preview and Esc all stay in sync: the button shows pressed and the menu item shows a checkmark
- [x] Clicking the button doesn't take focus or the caret from the editor
- [x] Windows: custom title bar with title, preview button and native-looking minimize/maximize/close
- [x] Verified by clicking through on macOS
- [ ] Verified on Windows (title bar drag, double-click maximize, edge resize, caption buttons, close prompt)

### W-037 Snap Layouts on the custom Windows title bar
Status: Todo · Platforms: Windows
As a Windows 11 user, I want hovering the maximize button to show Snap Layouts, like other apps.
- [ ] Snap Layouts flyout appears when hovering maximize (needs native hit-testing of that button region)
- [ ] Custom title bar otherwise unchanged

### W-011 See task lists as checkboxes
Status: Done · Platforms: macOS, Windows
As a writer, I want `- [ ]` and `- [x]` to show as checkboxes in preview and exports.
- [x] Unchecked and checked boxes render in preview, print and HTML export
- [x] Checked items are visually muted

### W-012 Tick task checkboxes in preview
Status: Done · Platforms: macOS (Windows verification moved to W-053)
As a writer, I want to click a checkbox in preview to tick it, so I can use documents as to-do lists.
- [x] Clicking a checkbox toggles `[ ]` ↔ `[x]` on the matching source line (also nested, ordered and quoted items)
- [x] The change is undoable and marks the document as edited (Undo/Redo also work while in preview)
- [x] Checkboxes stay non-interactive in print and exports
- [x] Verified by clicking through on macOS

### W-053 Verify ticking task checkboxes on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-012's clickable preview checkboxes to work in a real build.
- [ ] Clicking a box in preview toggles the source line (nested, ordered and quoted items too), is undoable and marks the document as edited

### W-013 Export to HTML
Status: Done · Platforms: macOS, Windows
As a writer, I want to export a single HTML file that looks like my preview, so I can publish or share it.
- [x] Self-contained file with styles and fonts embedded
- [x] Respects the reader's light/dark mode
- [x] Raw HTML in the document is shown as text, never executed

### W-014 Export dialog with a format choice
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want one Export… dialog where I choose the format.
- [x] macOS: native save sheet with "Export To: HTML / PDF"; switching format updates the extension
- [x] Windows: HTML / PDF in the "Save as type" list
- [x] Verified by clicking through on macOS
- [ ] Verified on a Windows build (the Windows code has never been compiled)

### W-015 Export to PDF
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want to export a properly paginated PDF directly, without going through the print dialog.
- [x] PDF written to the chosen file, with page margins and page-break rules
- [x] Verified on macOS: multiple pages, not blank, not one long page
- [ ] Verified on Windows (including whether checked task boxes keep their fill)

### W-016 Print
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want to print my document (Cmd/Ctrl+P) with clean paper typography.
- [x] Prints the rendered document only, black on white, regardless of dark mode
- [x] Verified that the whole document prints on macOS, not just the visible part
- [ ] Verified on Windows

### W-044 Syntax highlighting in preview code blocks
Status: Needs verification (Windows only) · Platforms: all
As a writer, I want fenced code blocks with a language (```` ```js ````) to be syntax highlighted in preview, so code in my documents is easy to read.
- [x] Preview highlights fenced code blocks by their info string (name, alias or extension, e.g. `js`, `py`, `rs`); unknown or missing languages show as plain code
- [x] The same highlighting appears in print, PDF and HTML export (HTML stays self-contained, no scripts)
- [x] A small, muted palette from `--code-*` tokens, with light, dark and print variants
- [x] Highlighter output is escaped text only (markdown-it stays `html: false`)
- [x] Verified on macOS: preview, print, PDF and HTML export in light and dark mode
- [ ] Verified on Windows (including whether PDF export keeps the code colours)

### W-045 Muted code highlighting in the editor
Status: Done · Platforms: macOS (Windows verification moved to W-054)
As a writer of technical documents, I want code inside fenced blocks to be lightly highlighted in the editor, so I can read it while I write.
- [x] Uses the same Lezer parsers and `--code-*` colours as preview (W-044), via CodeMirror's `codeLanguages` (`editor/code.ts`, unit tested in `editor/code.test.ts`)
- [x] Muted: much lower contrast than preview, so code never competes with the prose or the dimmed Markdown marks (each colour mixed 45% with `--text-muted`)
- [x] Off by default, toggled from View → Code Highlighting; the setting persists (using W-020's preferences store)
- [x] Verified in the app on macOS: toggle on and off with the checkmark in step across windows, colours look muted in light and dark mode, a language loads the first time its fence appears, the setting survives a relaunch

### W-054 Verify editor code highlighting on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-045's muted code highlighting to work in a real build.
- [ ] View → Code Highlighting toggles it with the checkmark in step across windows; colours look muted in light and dark mode; the setting survives a relaunch

### W-019 Word count and reading time
Status: Done · Platforms: macOS (Windows verification moved to W-051)
As a writer, I want to see word count and reading time, so I can track length without leaving the editor.
- [x] Subtle footer showing words and reading time; shows the selection's count when text is selected
- [x] Can be hidden from the View menu (View → Word Count)
- [x] Markdown syntax isn't counted as words (unit tested in `editor/count.test.ts`)
- [x] Verified in the app on macOS: footer looks right in light and dark mode, updates while typing and selecting, shows in preview, toggles from the menu with the checkmark in step across windows

### W-020 Remember preferences
Status: Done · Platforms: macOS (Windows verification moved to W-051)
As a writer, I want the app to remember my view settings between launches.
- [x] Word-count visibility and last export format persist (`preferences.json`, see architecture.md → Preferences)
- [x] Window size and position persist (already handled by window-state for the `main` window)
- [x] Verified in the app on macOS: hide the word count and export as PDF, quit, relaunch; both are remembered, and a second window follows a change made in the first

### W-051 Verify word count and preferences on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-019's word count and W-020's preferences to work in a real build.
- [ ] Footer looks right in light and dark mode, counts numbers and CRLF files correctly, and View → Word Count toggles it with the checkmark in step across windows
- [ ] Word-count visibility, last export format, and window size and position survive a relaunch (`preferences.json` in the app data folder)

### W-056 Verify the settings window on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-021's settings window to work in a real build (its Windows theme path and menu code have never been compiled or run).
- [ ] Edit → Settings… (Ctrl+,) opens it; it sizes to its content and the cards look right in light and dark mode; controls work with mouse and keyboard
- [ ] Every setting applies live in all windows and survives a relaunch; App theme switches menus, dialogs and every window; View → Bigger / Smaller / Actual Size (Ctrl + / − / 0) change the text size

### W-021 Settings window
Status: Done · Platforms: macOS (Windows verification moved to W-056)
As a writer, I want a native-feeling settings window for text size, column width, theme and other options.
- [x] Opens from the app menu (Settings… Cmd+, on macOS) or Edit/Tools on Windows (Edit → Settings… Ctrl+,)
- [x] A single pane (no tabs yet), styled like macOS System Settings and Windows 11 settings cards
- [x] Editor: text size (slider with a stop per size), column width (Narrow / Medium / Wide, 58 / 66 / 80 characters), line spacing (Tight / Normal / Loose), check spelling while typing
- [x] View → Bigger / Smaller / Actual Size (Cmd/Ctrl + / − / 0) change the same text size setting
- [x] Appearance: Match System / Light / Dark (Windows: "App theme", "Use system setting")
- [x] Word count and code highlighting, the same preferences the View menu toggles, with the menu checkmarks kept in step
- [x] Every setting applies live in all windows and persists between launches (using W-020's preferences store; unit tested in `settings.test.ts`, `preferences.test.ts`, `editor/setup.test.ts`)
- [x] Built with Bits UI components wrapped in `src/lib/ui/` (`Toggle`, `Choice`, `Slider`)
- [x] Verified in the app on macOS: the window sizes to its content and looks right in light and dark mode; controls work with mouse and keyboard; text size, width and spacing change live in editor and preview but not in print or PDF; the theme switches menus, dialogs and every window; Cmd+W closes Settings; Open… from Settings shows the Open dialog; a relaunch keeps every setting

### W-068 Animate showing and hiding the preview
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want the preview to dissolve in and out rather than cut, so the switch feels like one document changing form.
- [x] Preview fades in over the editor, rising slightly, and fades out to reveal the editor already scrolled to where I was reading
- [x] Reduce Motion keeps the fade but drops the movement (unit tested in `preview/transition.test.ts`)
- [x] Verified in the app on macOS: button, Cmd+R, Esc and the menu; light and dark; caret back in the editor after leaving
- [ ] Verified on Windows

### W-067 Verify hanging heading marks on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-066's heading marks to work in a real build.
- [ ] Resize from wide to narrow at small and large text sizes and in each font, with the scrollbar showing; markers hang whole, partly or not at all as there is room, and never reach the window's edge; caret, selection and clicking on a heading line still land in the right place

### W-066 Heading marks hang only as far as there is room
Status: Done · Platforms: macOS (Windows verification moved to W-067)
As a writer, I want heading markers to adapt when the window is narrow, so they're never cut off at the window's edge.
- [x] Wide window: every marker, `#` to `######`, hangs whole and heading text lines up with body text
- [x] Narrower: a marker hangs only as far as the space beside the column, pushing its heading text in
- [x] Column fills the window: no marker hangs; heading text follows its marker
- [x] The editor's side padding is back to 2rem, the same as the preview
- [x] Which headings hang, and by how many characters, is unit tested (`editor/markdownStyling.test.ts`)
- [x] Verified in the app on macOS: resize from wide to narrow at small and large text sizes and in each font; caret, selection and clicking on a heading line still land in the right place

### W-065 Monaspace Neon as the default font
Status: Done · Platforms: macOS (Windows verification moved to W-064)
As a writer, I want the editor set in Monaspace Neon, with Argon as another choice, now that Classic Mono is gone.
- [x] Settings → Font: Monaspace Neon (the default), Monaspace Argon, Monaspace Radon or System Monospace
- [x] Classic Mono is removed from the app and the repo; a saved Classic Mono choice falls back to Neon (unit tested in `preferences.test.ts`)
- [x] Verified in the app on macOS: Neon shows on first launch and after upgrading from a Classic Mono choice; Argon shows with bold, italic and bold italic; heading marks still hang clear of the edge

### W-064 Verify the editor font on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-063's font setting and W-065's fonts to work in a real build.
- [ ] Each font shows in the editor, including bold, italic (Monaspace's slant axis) and bold italic; the column stays the chosen width in characters; hanging heading marks line up; a relaunch keeps the choice
- [ ] System Monospace shows Cascadia Mono (Consolas before Windows 11)
- [ ] Neon shows on first launch and after upgrading from a Classic Mono choice

### W-063 Choose the editor font
Status: Done · Platforms: macOS (Windows verification moved to W-064)
As a writer, I want to pick the editor's font, so I can write in the face I like best.
- [x] Settings → Font: Classic Mono (the default), Monaspace Neon, Monaspace Radon or System Monospace (SF Mono on macOS, Cascadia Mono or Consolas on Windows); in Settings only, not the View menu
- [x] Monaspace Neon and Radon are bundled as variable fonts (`static/fonts/monaspace/`, SIL OFL, licence beside them)
- [x] Only the editor changes; preview, print, PDF and HTML export keep the system font
- [x] Monaspace's code ligatures (`!=`, `...`, `://`) are off so the Markdown source stays visible; texture healing stays on
- [x] Applies live in all windows and persists between launches (unit tested in `settings.test.ts`, `preferences.test.ts`)
- [x] Verified in the app on macOS: each font shows in the editor, including bold, italic (Monaspace's slant axis) and bold italic; the column stays the chosen width in characters; hanging heading marks line up; a relaunch keeps the choice

### W-059 Verify spelling marks on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-057's spelling marks to work in a real build (its `ISpellChecker` code was written against the crate sources and has never been compiled or run).
- [ ] Misspellings get a red squiggle in the user's language (or US English), and the marks stay after Enter, scrolling and edits elsewhere
- [ ] Right-clicking a marked word shows suggestions, Ignore, Add to dictionary and working Cut / Copy / Paste; Ignore lasts until quit in every window, Add to dictionary across relaunches
- [ ] Settings → Check spelling while typing turns it on and off; typing stays smooth in a long document

### W-057 Spelling marks that stay
Status: Done · Platforms: macOS (Windows verification moved to W-059)
As a writer, I want every misspelled word underlined until I fix it, not just the word I've just typed.
WebKit's own checking loses its marks whenever CodeMirror redraws a line (it keeps them on the text nodes CodeMirror rewrites, and only rechecks the word just typed), so misspellings vanish as you write.
- [x] The system spell checker finds misspellings through Rust (macOS `NSSpellChecker`, Windows `ISpellChecker`), for the visible text and again after a pause in typing, in the system's spelling language
- [x] The editor draws them as its own decoration (red dotted underline on macOS, red squiggle on Windows), so redraws can't remove them; Markdown syntax, code, URLs and link targets are skipped
- [x] Right-clicking a misspelled word shows a native menu with suggestions, Learn Spelling and Ignore Spelling
- [x] Settings → Check spelling while typing turns this on and off; WebKit's own spell checking and autocorrect are off
- [x] Unit tested: which ranges are checked and skipped, mapping results back onto the document, updating marks after edits (`editor/spelling.test.ts`, `spelling.rs`)
- [x] Verified in the app on macOS: marks stay after Return, scrolling and edits elsewhere; typing stays smooth in a long document

### W-022 Find and replace
Status: Done · Platforms: macOS (Windows verification moved to W-047)
As a writer, I want to find and replace text with the standard shortcuts.
- [x] Cmd/Ctrl+F find, Cmd/Ctrl+G next, find and replace, via menu items (macOS: Edit → Find submenu with ⌘F, ⌥⌘F, ⌘G, ⇧⌘G and ⌘E; Windows: Ctrl+F, F3, Shift+F3 and Ctrl+H, as in Notepad, see decisions.md)
- [x] Search panel styled to match the OS, not CodeMirror's default (macOS find bar, Windows 11 flyout)
- [x] Verified on macOS: highlight while typing, match count, next/previous, replace and replace all (a single undo), Esc and Done, find from preview, a locked document, undo while typing in the find field

### W-047 Verify find and replace on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want the W-022 find flyout and shortcuts to work in a real build.
- [ ] Edit menu: Find… Ctrl+F, Find Next F3, Find Previous Shift+F3, Replace… Ctrl+H
- [ ] Flyout looks right in light and dark mode (Segoe Fluent Icons, field underline, shadow) and doesn't cover the match it scrolls to

### W-062 Verify the Format menu on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-060's Format menu to work in a real build (its menu code has never been compiled or run on Windows).
- [ ] Format sits between Edit and View; every item works from the menu and its Ctrl shortcut (Blockquote is Ctrl+Shift+.)
- [ ] Ctrl+Alt+U (Strikethrough) and Ctrl+Alt+Backspace (Clear Styles) don't clash with AltGr on keyboard layouts that use it (e.g. German, Polish)
- [ ] The items are greyed out in preview, on a locked document and in Settings; each change is one undo step and keeps CRLF line endings
- [ ] `==highlight==` shows highlighted in preview, HTML export, PDF and print

### W-060 Format menu
Status: Done · Platforms: macOS (Windows verification moved to W-062)
As a writer, I want a Format menu that applies Markdown formatting to the selected text, so I don't have to type the syntax by hand.
- [x] Format menu between Edit and View, with these groups and shortcuts (Cmd on macOS, Ctrl on Windows):
  - Headings ▸ (Heading 1–6, ⌘1–⌘6), Lists ▸ (Bulleted, Numbered, Task), Blockquote ⌘> (Ctrl+Shift+. on Windows), Body (removes heading, list and quote markers)
  - Bold ⌘B, Italic ⌘I, Strikethrough ⌥⌘U, Highlight ⇧⌘U
  - Code ⌘J, Code Block ⇧⌘J
  - Add Link ⌘K, Add Horizontal Rule
  - Clear Styles ⌥⌘⌫ (removes inline and line formatting from the selection)
- [x] Inline styles wrap the selection in their markers (`**`, `*`, `~~`, `==`, `` ` ``). Applying one to text that already has it removes it. With no selection, it inserts empty markers with the cursor between them
- [x] Line styles (headings, lists, Body) apply to every line the selection touches and replace any other heading or list marker; Blockquote wraps what's there instead. Applying the same one again removes it. Numbered lists count up from 1
- [x] Code Block wraps the selected lines in a fence. Add Link puts the selection in `[text]()` with the cursor in the URL, or puts a selected URL in `[](url)` with the cursor in the text
- [x] Each change is a single undo step, keeps the text selected, and keeps the file's line endings. The items are disabled in preview and when the document is locked
- [x] The preview, exports and print render `==highlight==` as highlighted text
- [x] Unit tested: wrap/unwrap/toggle for each style, multi-line selections, empty selections, mixed line styles, CRLF files (logic in `src/lib/editor/`, not `+page.svelte`)
- [x] Verified in the app on macOS: every item and shortcut, disabled in preview, on a locked document and in Settings, undo, highlight in preview, PDF and print

### W-061 More Format menu items
Status: Todo · Platforms: all
As a writer, I want more Format menu items, once W-060's basic formatting is done.
- [ ] Add Footnote ⌃⌘K, and footnotes render in preview and exports
- [ ] Add Table, Add Date, Add Page Break (honoured in print and PDF), Add Table of Contents
- [ ] Decide whether Structure ▸, Add Wikilink, Add Content Block and Add Hashtag fit Awen (they depend on library features, see W-030), and record the decision in `decisions.md`

### W-046 Find options
Status: Todo · Platforms: all
As a writer, I want to match case or whole words when I search, like other editors' find bars.
- [ ] Match Case and Whole Words options (macOS: a menu on the magnifying glass; Windows: an options button in the flyout)
- [ ] The choices persist between launches (using W-020's preferences store)

### W-017 Focus mode
Status: Done · Platforms: macOS (Windows verification moved to W-069)
As a writer, I want everything except the sentence or paragraph I'm writing to fade, so I can concentrate on the current thought.
- [x] View menu toggle with shortcut; choice of sentence or paragraph
- [x] Everything outside the focused unit is dimmed and follows the cursor as I type
- [x] Works in light and dark mode, and doesn't affect preview or exports
- [x] The on/off setting and sentence/paragraph choice persist between launches (using W-020's preferences store)

### W-069 Verify focus mode on Windows
Status: Needs verification · Platforms: Windows
As a Windows user, I want W-017's focus mode to work in a real build.
- [ ] View → Focus Mode (Ctrl+D) and Focus On ▸ Sentence / Paragraph work, with their checkmarks, and Ctrl+D doesn't clash with anything
- [ ] Dimmed text reads well in light and dark mode

### W-018 Typewriter scrolling
Status: Needs verification (not yet run on macOS or Windows) · Platforms: all
As a writer, I want the line I'm typing to stay vertically centered, so my eyes stay in one place.
- [x] View menu toggle with shortcut (View → Focus On ▸ Typewriter, turned on and off with Focus Mode's ⌘D / Ctrl+D; see decisions.md)
- [x] The cursor line stays centered while typing and moving the cursor
- [x] Works together with focus mode (as its third choice, beside Sentence and Paragraph)
- [x] The on/off setting persists between launches (using W-020's preferences store)
- [ ] Verified by running the app on macOS: View → Focus On ▸ Typewriter and its checkmark (Sentence / Paragraph / Typewriter exclusive), ⌘D turning it off and on, the line centred while typing, with arrow keys, after clicking or drag-selecting (not during the drag), and at the first and last lines, resizing the window, the find bar open
- [ ] Verified on Windows

### W-023 Recent files and open with
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want to reopen recent documents and open `.md` files from Finder/Explorer with Awen.
- [x] File → Open Recent submenu, clearable
- [x] Awen registers as an editor for `.md` files; double-clicking opens the file (bundle declares the association)
- [x] Opening a file while another is open opens it in a new window (W-024); an untouched Untitled window is reused
- [x] Verified on macOS with a bundled build: double-click with Awen closed (opens in the launch window, no extra Untitled), with Awen running, several files at once, a file already open, dropping on the Dock icon
- [ ] Verified on Windows installer build: association registered, double-click opens in the running instance (single-instance plugin, never compiled)

### W-024 Multiple windows
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want each document in its own window, so I can work on several at once.
- [x] New/Open create new windows; closing the last window follows platform conventions (macOS keeps running, Dock click or New/Open brings a window back; Windows exits)
- [x] Unsaved-changes prompts work per window; Quit asks each edited window in turn and Cancel stops it
- [x] Opening a file that is already open brings its window forward
- [x] macOS Window menu lists the open windows
- [x] Verified by running the app on macOS
- [ ] Verified on Windows (never compiled there)

### W-038 Quit from the Dock or on logout asks about unsaved changes
Status: Done · Platforms: macOS
As a Mac user, I want Quit from the Dock menu, and logging out, to ask about unsaved changes like Quit Awen does.
- [x] Handle `applicationShouldTerminate:` (tao doesn't forward it) and run the same close-each-window flow
- [x] Verified: Dock → Quit with an edited document prompts; Cancel keeps Awen running; logout waits for the prompt

### W-040 Recent documents in the Dock menu and Jump List
Status: Done · Platforms: macOS (Windows verification moved to W-041)
As a writer, I want my recent documents in the Dock menu (macOS) and the taskbar Jump List (Windows), like other document apps.
- [x] macOS: opened and saved files are added with `NSDocumentController noteNewRecentDocumentURL:`; the Dock menu lists them and choosing one opens it
- [x] Clear Menu in File → Open Recent clears the system list too
- [x] Windows: recent files appear in the Jump List (`SHAddToRecentDocs`); Clear Menu uses `RemoveAllDestinations` (code written, see W-041)
- [x] Verified on macOS with a bundled build: open and Save As add entries, choosing one opens it, Clear Menu empties it

### W-041 Verify recent documents in the Windows Jump List
Status: Needs verification · Platforms: Windows
As a Windows user, I want the W-040 Jump List to work in a real build.
- [ ] Compiles on Windows (`recent::system`, never built)
- [ ] Installer build: Jump List shows recents, choosing one opens it in the running instance, Clear Menu empties it

### W-039 Show unsaved state in the close button
Status: Done · Platforms: macOS
As a Mac user, I want the dot in the red close button when a document has unsaved changes, like other document apps.
- [x] `NSWindow.documentEdited` follows the dirty flag
- [x] Verified by running the app

### W-042 Rename, tag and move from the title
Status: Done · Platforms: macOS
As a Mac user, I want to click the document title to rename it, set its Finder tags or move it, like NSDocument apps (`Inspiration/file_name_save.png`).
- [x] Hovering the title shows a chevron; clicking it (or File → Rename…) opens a native popover with Name, Tags and Where
- [x] Name is selected without its extension; Return or clicking outside applies, Esc cancels
- [x] Renaming or moving keeps unsaved edits, updates the title, Open Recent and the window's path; an existing file is never overwritten
- [x] Where lists the current folder, Desktop, Documents, Downloads, iCloud Drive and Other…
- [x] Tags are read from and written to the file's Finder tags
- [x] An untitled document is saved to the chosen name and place
- [x] Dragging the window by the title still works
- [x] Verified by running the app

### W-043 Lock a document
Status: Done · Platforms: macOS
As a Mac user, I want the Locked checkbox from the title popover (W-042), so I can protect a finished document from edits.
- [x] Locked checkbox in the title popover sets the file's locked flag (`NSURLIsUserImmutableKey`)
- [x] A locked document is read-only and its title shows "— Locked"; typing offers to unlock or duplicate, as TextEdit does
- [x] Locking in Finder shows in Awen when its window comes forward
- [x] Verified by running the app

---

## M3: Library, polish and mobile

### W-030 Library sidebar
Status: Todo · Platforms: macOS, Windows
As a writer, I want a sidebar listing the Markdown files in a folder I choose, so I can move between documents quickly.
- [ ] Choose a library folder; the sidebar lists `.md` files and subfolders
- [ ] Clicking a file opens it (following the unsaved-changes rules)
- [ ] Sidebar toggles from the View menu; uses vibrancy on macOS and Mica on Windows if W-032 lands

### W-031 Search across the library
Status: Todo · Platforms: macOS, Windows
As a writer, I want to search the text of every document in my library.
- [ ] Full-text search from the sidebar, with results showing the matching line
- [ ] Opening a result jumps to the match

### W-032 Translucent window materials
Status: Todo · Platforms: macOS, Windows
As a Mac or Windows user, I want the sidebar to use the system's translucent material, like native apps.
- [ ] macOS vibrancy and Windows Mica on the sidebar
- [ ] Decision recorded on the Mac App Store trade-off (`macOSPrivateApi`), see decisions.md

### W-033 Show images in preview
Status: Needs verification (Windows, mobile) · Platforms: all
As a writer, I want `![](photo.png)` images next to my document to show in preview and exports.
- [x] Relative image paths resolve against the document's folder in preview
- [x] Images are included in PDF export and resolve in HTML export saved beside the document
- [x] Only files the user opened or their folder are readable (asset protocol scope)

Verified in the macOS preview (local, data-URI and missing images). Windows (`http://asset.localhost` URLs) and mobile are unverified. Images in a parent folder (`../`) are blocked by the scope.

### W-034 Awen on iPhone, iPad and Android
Status: Todo · Platforms: iOS, Android
As a writer, I want to write on my phone and tablet with the same focused experience.
- [ ] `tauri ios init` / `tauri android init` projects created and committed
- [ ] Touch-friendly layout with Konsta UI; keyboard toolbar for Markdown marks
- [ ] Open and save documents through the system file pickers

### W-035 Signed and notarized releases
Status: Todo · Platforms: macOS, Windows
As a user, I want to install Awen without security warnings.
- [ ] macOS build signed with Developer ID and notarized
- [ ] Windows installer signed
- [ ] Release steps documented in `docs/agents/` (signing keys stay out of git)

Builds already come from `.github/workflows/release.yml` (W-070). Signing means adding the `APPLE_*` secrets (in a `release` environment) to its `tauri build` step and a Windows signing step, and replacing the ad-hoc `signingIdentity`.

### W-070 Automated release builds
Status: Needs verification (downloads on macOS and Windows) · Platforms: macOS, Windows
As a maintainer, I want pushing a version tag to build the installers, so releasing doesn't depend on my machine.
- [x] The version lives in `package.json`; `make release VERSION=x.y.z` updates the other copies, commits and tags
- [x] CI (tests, svelte-check, fmt, clippy, cargo test) is green on macOS and Windows
- [x] Pushing `vX.Y.Z` creates a draft release with the arm64 and x64 DMGs, the setup `.exe` and the `.msi`, named as in the README
- [ ] Downloads open as the README describes (ad-hoc signed on macOS)

`v0.1.0` built and uploaded all four installers. Provenance attestations are skipped until the repo is public (GitHub refuses them for a personal account's private repo).

### W-071 Automatic updates
Status: Todo · Platforms: macOS, Windows
As a user, I want Awen to tell me about a new version and install it, so I don't have to download it by hand.
- [ ] `tauri-plugin-updater` checks `latest.json` from the latest GitHub release (`releases/latest/download/latest.json`)
- [ ] Updates are signed with a Tauri updater key: public key in `tauri.conf.json`, private key and password only in GitHub secrets (never in git)
- [ ] `release.yml` builds updater artifacts (`bundle.createUpdaterArtifacts`), uploads the `.sig` files and the `.app.tar.gz`, and publishes `latest.json` for all three targets
- [ ] A Check for Updates… menu item (Awen menu on macOS, Help menu on Windows) and a quiet check at launch
- [ ] A native dialog offers Install and Relaunch or Later. Installing goes through the same unsaved-changes prompts as Quit
- [ ] A Settings toggle turns the launch check off
- [ ] An update installed on macOS opens without the Gatekeeper prompt (check on a real Mac)

Blocked until release downloads are public: assets of a private repo's releases need a GitHub login, so installed copies can't fetch `latest.json`. Either make the repo public or publish releases to a public repo or CDN.
