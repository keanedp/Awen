import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { markdownWithCode } from "./code";
import { find } from "./find";
import type { DimmedUnit } from "../settings";
import { focusMode } from "./focus";
import { markdownStyling } from "./markdownStyling";
import { spellChecker, spelling, type SpellChecker } from "./spelling";
import { typewriterScrolling } from "./typewriter";

/** Code highlighting in the editor (W-045): preview's colors, mixed well towards the muted code text. */
const muted = (name: string) => ({ color: `color-mix(in srgb, var(--code-${name}) 45%, var(--text-muted))` });

const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontFamily: "var(--font-writing)",
    fontSize: "var(--writing-size)",
    // Monaspace joins `!=`, `...` and `://` in `liga`, hiding the Markdown source.
    // Its texture healing is in `calt`, which this leaves on.
    fontVariantLigatures: "no-common-ligatures",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "var(--writing-line-height)",
    // For `.cm-hanging-heading`: 100cqw is the width the column is centerd in.
    containerType: "inline-size",
  },
  ".cm-content": {
    maxWidth: "var(--measure)",
    margin: "0 auto",
    padding: "2rem 2rem 40vh",
  },
  ".cm-line": { position: "relative", padding: "0" },
  // A heading's marker hangs into the space beside the column, but
  // only as far as there is room, so in a narrow window it pushes the heading text in
  // rather than reaching the edge. The column is `--measure` wide at most (border-box),
  // so the room is what's left of the width either side of it. `--hang` is the marker's
  // length in characters, set per line (`markdownStyling.ts`).
  ".cm-hanging-heading": {
    textIndent: "calc(-1 * min(var(--hang) * 1ch, max(0px, (100cqw - var(--measure)) / 2)))",
  },
  // Fenced code blocks (`markdownStyling.ts`). The shadows widen the background
  // past the column without moving the text.
  ".cm-code-line": {
    backgroundColor: "var(--code-bg)",
    boxShadow: "-0.75rem 0 0 var(--code-bg), 0.75rem 0 0 var(--code-bg)",
  },
  ".cm-code-first": { paddingTop: "2px" },
  // Drawn by CodeMirror (`drawSelection`), not WebKit; see decisions.md.
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--caret)", marginLeft: "-1px" },
  ".cm-selectionBackground": { background: "var(--selection-inactive)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "var(--selection)",
  },
  // The find bar draws its own background and separator.
  ".cm-panels": { backgroundColor: "transparent", color: "inherit" },
  ".cm-panels-top": { borderBottom: "none" },
  ".cm-searchMatch": { backgroundColor: "var(--find-match)", borderRadius: "2px" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--find-current)" },
  // A dotted underline on macOS, a squiggle on Windows (the token files).
  ".cm-misspelled": {
    textDecorationLine: "underline",
    textDecorationStyle: "var(--misspelled-style)",
    textDecorationColor: "var(--misspelled)",
    textDecorationThickness: "2px",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
  // Focus mode (W-017): what's outside the sentence or paragraph at the caret.
  ".cm-unfocused": { opacity: "var(--unfocused-opacity)" },
  ".hl-keyword": muted("keyword"),
  ".hl-string": muted("string"),
  ".hl-literal": muted("literal"),
  ".hl-comment": muted("comment"),
  ".hl-type": muted("type"),
  ".hl-function": muted("function"),
  ".hl-property": muted("property"),
  ".hl-inserted": muted("inserted"),
  ".hl-deleted": muted("deleted"),
});

/** Files keep their original line endings; CodeMirror otherwise normaliz to "\n". */
function detectLineSeparator(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * With a line separator set, CodeMirror only splits inserted text on that
 * separator, so pasted or dropped text with other endings would leave stray
 * "\r" or "\n" inside lines. Convert it to the file's own.
 */
const matchLineBreaks = EditorView.clipboardInputFilter.of((text, state) =>
  text.replace(/\r\n?|\n/g, state.lineBreak),
);

/** Holds the read-only state of a locked document. */
const lock = new Compartment();

/**
 * Holds Settings → Check spelling while typing. The editor marks misspellings
 * itself (`spelling.ts`); WebKit's spell checking and autocorrect stay off, as
 * CodeMirror sets them.
 */
const checkSpelling = new Compartment();

/**
 * `onLockedEdit` runs when the user tries to change a locked document: typing,
 * deleting, pasting, cutting or dropping. CodeMirror itself ignores the edit.
 * `onSelect` runs when the text or the selection changes. `highlightCode`
 * turns on muted highlighting in fenced code blocks (`setCodeHighlighting`);
 * `spellcheck` marks misspellings (`setSpellcheck`) found by `spellChecker`,
 * the system's checker in the app. `focus` dims all but the sentence or
 * paragraph at the caret (`setFocusMode`); `typewriter` keeps the caret's
 * line in the middle (`setTypewriterScrolling`).
 */
export function createState(
  doc: string,
  onChange: (view: EditorView) => void,
  onLockedEdit: () => void,
  onSelect: (view: EditorView) => void = () => {},
  {
    highlightCode = false,
    spellcheck = true,
    checker,
    focus = null,
    typewriter = false,
  }: {
    highlightCode?: boolean;
    spellcheck?: boolean;
    checker?: SpellChecker;
    focus?: DimmedUnit | null;
    typewriter?: boolean;
  } = {},
): EditorState {
  const blocked = (_: Event, view: EditorView) => {
    if (!view.state.readOnly) return false;
    onLockedEdit();
    return true;
  };
  return EditorState.create({
    doc,
    extensions: [
      lock.of(EditorState.readOnly.of(false)),
      EditorView.domEventHandlers({
        beforeinput: blocked,
        paste: blocked,
        drop: blocked,
        // Still copies, as CodeMirror's own handler does when read-only.
        cut: (e, view) => (blocked(e, view), false),
      }),
      EditorState.lineSeparator.of(detectLineSeparator(doc)),
      matchLineBreaks,
      // WebKit's own caret can stay behind when a line is redrawn, e.g. deleting a fence's backticks.
      drawSelection(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      find(onLockedEdit),
      markdownWithCode(highlightCode),
      markdownStyling,
      EditorView.lineWrapping,
      checker ? spellChecker.of(checker) : [],
      checkSpelling.of(spellcheck ? spelling : []),
      focusMode(focus),
      typewriterScrolling(typewriter),
      theme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.view);
        if (update.docChanged || update.selectionSet) onSelect(update.view);
      }),
    ],
  });
}

/** Makes the editor read-only (a locked file) or editable again. */
export function setReadOnly(view: EditorView, readOnly: boolean) {
  view.dispatch({ effects: lock.reconfigure(EditorState.readOnly.of(readOnly)) });
}

/** Turns spell checking on or off in an open editor. */
export function setSpellcheck(view: EditorView, on: boolean) {
  view.dispatch({ effects: checkSpelling.reconfigure(on ? spelling : []) });
}

/** The document text with its original line endings. */
export function documentText(view: { state: EditorState }): string {
  return view.state.sliceDoc();
}
