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

Next free ID: **W-036**

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

### W-011 See task lists as checkboxes
Status: Done · Platforms: macOS, Windows
As a writer, I want `- [ ]` and `- [x]` to show as checkboxes in preview and exports.
- [x] Unchecked and checked boxes render in preview, print and HTML export
- [x] Checked items are visually muted

### W-012 Tick task checkboxes in preview
Status: Todo · Platforms: all
As a writer, I want to click a checkbox in preview to tick it, so I can use documents as to-do lists.
- [ ] Clicking a checkbox toggles `[ ]` ↔ `[x]` on the matching source line
- [ ] The change is undoable and marks the document as edited

### W-013 Export to HTML
Status: Done · Platforms: macOS, Windows
As a writer, I want to export a single HTML file that looks like my preview, so I can publish or share it.
- [x] Self-contained file with styles and fonts embedded
- [x] Respects the reader's light/dark mode
- [x] Raw HTML in the document is shown as text, never executed

### W-014 Export dialog with a format choice
Status: Needs verification · Platforms: macOS, Windows
As a writer, I want one Export… dialog where I choose the format, like focused editors (`Inspiration/export.png`).
- [x] macOS: native save sheet with "Export To: HTML / PDF"; switching format updates the extension
- [x] Windows: HTML / PDF in the "Save as type" list
- [ ] Verified by clicking through on macOS
- [ ] Verified on a Windows build (the Windows code has never been compiled)

### W-015 Export to PDF
Status: Needs verification · Platforms: macOS, Windows
As a writer, I want to export a properly paginated PDF directly, without going through the print dialog.
- [x] PDF written to the chosen file, with page margins and page-break rules
- [ ] Verified on macOS: multiple pages, not blank, not one long page
- [ ] Verified on Windows (including whether checked task boxes keep their fill)

### W-016 Print
Status: Needs verification · Platforms: macOS, Windows
As a writer, I want to print my document (Cmd/Ctrl+P) with clean paper typography.
- [x] Prints the rendered document only, black on white, regardless of dark mode
- [ ] Verified that the whole document prints on macOS, not just the visible part
- [ ] Verified on Windows

### W-017 Focus mode
Status: Todo · Platforms: all
As a writer, I want everything except the sentence or paragraph I'm writing to fade, so I can concentrate on the current thought.
- [ ] View menu toggle with shortcut; choice of sentence or paragraph
- [ ] Everything outside the focused unit is dimmed and follows the cursor as I type
- [ ] Works in light and dark mode, and doesn't affect preview or exports

### W-018 Typewriter scrolling
Status: Todo · Platforms: all
As a writer, I want the line I'm typing to stay vertically centered, so my eyes stay in one place.
- [ ] View menu toggle with shortcut
- [ ] The cursor line stays centered while typing and moving the cursor
- [ ] Works together with focus mode

### W-019 Word count and reading time
Status: Todo · Platforms: all
As a writer, I want to see word count and reading time, so I can track length without leaving the editor.
- [ ] Subtle footer showing words and reading time; shows the selection's count when text is selected
- [ ] Can be hidden from the View menu
- [ ] Markdown syntax isn't counted as words

### W-020 Remember preferences
Status: Todo · Platforms: all
As a writer, I want the app to remember my view settings between launches.
- [ ] Focus mode, typewriter mode, word-count visibility and last export format persist
- [ ] Window size and position persist (already handled by window-state; verify)

### W-021 Settings window
Status: Todo · Platforms: macOS, Windows
As a writer, I want a native-feeling settings window for font size, line width and other options.
- [ ] Opens from the app menu (Settings… Cmd+, on macOS) or Edit/Tools on Windows
- [ ] Font size and column width adjust live
- [ ] Built with the planned Bits UI components wrapped in `src/lib/ui/`

### W-022 Find and replace
Status: Todo · Platforms: all
As a writer, I want to find and replace text with the standard shortcuts.
- [ ] Cmd/Ctrl+F find, Cmd/Ctrl+G next, find and replace, via menu items
- [ ] Search panel styled to match the OS, not CodeMirror's default

### W-023 Recent files and open with
Status: Todo · Platforms: macOS, Windows
As a writer, I want to reopen recent documents and open `.md` files from Finder/Explorer with Writer.
- [ ] File → Open Recent submenu, clearable
- [ ] Writer registers as an editor for `.md` files; double-clicking opens the file
- [ ] Opening a file while another is open follows the unsaved-changes rules (or opens a new window, see W-024)

### W-024 Multiple windows
Status: Todo · Platforms: macOS, Windows
As a writer, I want each document in its own window, so I can work on several at once.
- [ ] New/Open create new windows; closing the last window follows platform conventions
- [ ] Unsaved-changes prompts work per window

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
Status: Todo · Platforms: all
As a writer, I want `![](photo.png)` images next to my document to show in preview and exports.
- [ ] Relative image paths resolve against the document's folder in preview
- [ ] Images are included in PDF export and resolve in HTML export saved beside the document
- [ ] Only files the user opened or their folder are readable (asset protocol scope)

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
