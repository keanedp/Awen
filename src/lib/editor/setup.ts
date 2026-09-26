import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { markdownWithCode } from "./code";
import { find } from "./find";
import { markdownStyling } from "./markdownStyling";

/** Code highlighting in the editor (W-045): preview's colours, mixed well towards the muted code text. */
const muted = (name: string) => ({ color: `color-mix(in srgb, var(--code-${name}) 45%, var(--text-muted))` });

const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontFamily: "var(--font-writing)",
    fontSize: "var(--writing-size)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "var(--writing-line-height)",
  },
  ".cm-content": {
    maxWidth: "var(--measure)",
    margin: "0 auto",
    padding: "2rem 2rem 40vh",
    caretColor: "var(--caret)",
  },
  ".cm-line": { position: "relative", padding: "0" },
  ".cm-hanging-mark": {
    position: "absolute",
    transform: "translateX(-100%)",
  },
  "::selection, .cm-content ::selection": { backgroundColor: "var(--selection)" },
  // The find bar draws its own background and separator.
  ".cm-panels": { backgroundColor: "transparent", color: "inherit" },
  ".cm-panels-top": { borderBottom: "none" },
  ".cm-searchMatch": { backgroundColor: "var(--find-match)", borderRadius: "2px" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--find-current)" },
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

/** Files keep their original line endings; CodeMirror otherwise normalises to "\n". */
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
 * `onLockedEdit` runs when the user tries to change a locked document: typing,
 * deleting, pasting, cutting or dropping. CodeMirror itself ignores the edit.
 * `onSelect` runs when the text or the selection changes. `highlightCode`
 * turns on muted highlighting in fenced code blocks (`setCodeHighlighting`).
 */
export function createState(
  doc: string,
  onChange: (view: EditorView) => void,
  onLockedEdit: () => void,
  onSelect: (view: EditorView) => void = () => {},
  highlightCode = false,
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
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      find(onLockedEdit),
      markdownWithCode(highlightCode),
      markdownStyling,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "on" }),
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

/** The document text with its original line endings. */
export function documentText(view: { state: EditorState }): string {
  return view.state.sliceDoc();
}
