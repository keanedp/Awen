# Backlog

User stories for Writer, grouped by milestone. This file is the single place to track progress, for people and agents alike.

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
- move it to `Needs verification` if you couldn't run it on every stated platform, and say what's unverified;
- add a new story for any follow-up work you discover (use the next free ID; don't reuse IDs).

Record decisions in `docs/agents/decisions.md`, not here.

**Find open work:** `grep -n "Status: Todo\|Status: In progress\|Status: Needs" docs/backlog.md`

Next free ID: **W-048**

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
As a writer, I want a play button in the window header, like focused editors, so I can switch to preview without remembering the shortcut.
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
Status: Needs verification · Platforms: all
As a writer, I want to click a checkbox in preview to tick it, so I can use documents as to-do lists.
- [x] Clicking a checkbox toggles `[ ]` ↔ `[x]` on the matching source line (also nested, ordered and quoted items)
- [x] The change is undoable and marks the document as edited (Undo/Redo also work while in preview)
- [x] Checkboxes stay non-interactive in print and exports
- [ ] Verified by clicking through on macOS
- [ ] Verified on Windows

### W-013 Export to HTML
Status: Done · Platforms: macOS, Windows
As a writer, I want to export a single HTML file that looks like my preview, so I can publish or share it.
- [x] Self-contained file with styles and fonts embedded
- [x] Respects the reader's light/dark mode
- [x] Raw HTML in the document is shown as text, never executed

### W-014 Export dialog with a format choice
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want one Export… dialog where I choose the format, like focused editors (`Inspiration/export.png`).
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
Status: Todo · Platforms: all
As a writer of technical documents, I want code inside fenced blocks to be lightly highlighted in the editor, so I can read it while I write.
- [ ] Uses the same Lezer parsers and `--code-*` colours as preview (W-044), via CodeMirror's `codeLanguages`
- [ ] Muted: much lower contrast than preview, so code never competes with the prose or the dimmed Markdown marks
- [ ] Off by default, toggled from the View menu; the setting persists (using W-020's preferences store)

### W-019 Word count and reading time
Status: Todo · Platforms: all
As a writer, I want to see word count and reading time, so I can track length without leaving the editor.
- [ ] Subtle footer showing words and reading time; shows the selection's count when text is selected
- [ ] Can be hidden from the View menu
- [ ] Markdown syntax isn't counted as words

### W-020 Remember preferences
Status: Todo · Platforms: all
As a writer, I want the app to remember my view settings between launches.
- [ ] Word-count visibility and last export format persist
- [ ] Window size and position persist (already handled by window-state; verify)

### W-021 Settings window
Status: Todo · Platforms: macOS, Windows
As a writer, I want a native-feeling settings window for font size, line width and other options.
- [ ] Opens from the app menu (Settings… Cmd+, on macOS) or Edit/Tools on Windows
- [ ] Font size and column width adjust live
- [ ] Built with the planned Bits UI components wrapped in `src/lib/ui/`

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

### W-046 Find options
Status: Todo · Platforms: all
As a writer, I want to match case or whole words when I search, like other editors' find bars.
- [ ] Match Case and Whole Words options (macOS: a menu on the magnifying glass; Windows: an options button in the flyout)
- [ ] The choices persist between launches (using W-020's preferences store)

### W-017 Focus mode
Status: Todo · Platforms: all
As a writer, I want everything except the sentence or paragraph I'm writing to fade, so I can concentrate on the current thought.
- [ ] View menu toggle with shortcut; choice of sentence or paragraph
- [ ] Everything outside the focused unit is dimmed and follows the cursor as I type
- [ ] Works in light and dark mode, and doesn't affect preview or exports
- [ ] The on/off setting and sentence/paragraph choice persist between launches (using W-020's preferences store)

### W-018 Typewriter scrolling
Status: Todo · Platforms: all
As a writer, I want the line I'm typing to stay vertically centered, so my eyes stay in one place.
- [ ] View menu toggle with shortcut
- [ ] The cursor line stays centered while typing and moving the cursor
- [ ] Works together with focus mode
- [ ] The on/off setting persists between launches (using W-020's preferences store)

### W-023 Recent files and open with
Status: Needs verification (Windows only) · Platforms: macOS, Windows
As a writer, I want to reopen recent documents and open `.md` files from Finder/Explorer with Writer.
- [x] File → Open Recent submenu, clearable
- [x] Writer registers as an editor for `.md` files; double-clicking opens the file (bundle declares the association)
- [x] Opening a file while another is open opens it in a new window (W-024); an untouched Untitled window is reused
- [x] Verified on macOS with a bundled build: double-click with Writer closed (opens in the launch window, no extra Untitled), with Writer running, several files at once, a file already open, dropping on the Dock icon
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
As a Mac user, I want Quit from the Dock menu, and logging out, to ask about unsaved changes like Quit Writer does.
- [x] Handle `applicationShouldTerminate:` (tao doesn't forward it) and run the same close-each-window flow
- [x] Verified: Dock → Quit with an edited document prompts; Cancel keeps Writer running; logout waits for the prompt

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
- [x] Locking in Finder shows in Writer when its window comes forward
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

### W-034 Writer on iPhone, iPad and Android
Status: Todo · Platforms: iOS, Android
As a writer, I want to write on my phone and tablet with the same focused experience.
- [ ] `tauri ios init` / `tauri android init` projects created and committed
- [ ] Touch-friendly layout with Konsta UI; keyboard toolbar for Markdown marks
- [ ] Open and save documents through the system file pickers

### W-035 Signed and notarized releases
Status: Todo · Platforms: macOS, Windows
As a user, I want to install Writer without security warnings.
- [ ] macOS build signed with Developer ID and notarized
- [ ] Windows installer signed
- [ ] Release steps documented in `docs/agents/` (signing keys stay out of git)
