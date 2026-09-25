import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
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
});

/** Files keep their original line endings; CodeMirror otherwise normalises to "\n". */
function detectLineSeparator(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function createState(doc: string, onChange: (view: EditorView) => void): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      EditorState.lineSeparator.of(detectLineSeparator(doc)),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
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

/** The document text with its original line endings. */
export function documentText(view: EditorView): string {
  return view.state.sliceDoc();
}
