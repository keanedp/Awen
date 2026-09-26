import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { find } from "./find";
import { markdownStyling } from "./markdownStyling";

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
});

/** Files keep their original line endings; CodeMirror otherwise normalises to "\n". */
function detectLineSeparator(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Holds the read-only state of a locked document. */
const lock = new Compartment();

/**
 * `onLockedEdit` runs when the user tries to change a locked document: typing,
 * deleting, pasting, cutting or dropping. CodeMirror itself ignores the edit.
 */
export function createState(
  doc: string,
  onChange: (view: EditorView) => void,
  onLockedEdit: () => void,
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
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      find(onLockedEdit),
      markdown({ base: markdownLanguage }),
      markdownStyling,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "on" }),
      theme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.view);
      }),
    ],
  });
}

/** Makes the editor read-only (a locked file) or editable again. */
export function setReadOnly(view: EditorView, readOnly: boolean) {
  view.dispatch({ effects: lock.reconfigure(EditorState.readOnly.of(readOnly)) });
}

/** The document text with its original line endings. */
export function documentText(view: EditorView): string {
  return view.state.sliceDoc();
}
