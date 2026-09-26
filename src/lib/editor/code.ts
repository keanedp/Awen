import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languageDataProp, syntaxHighlighting } from "@codemirror/language";
import { Compartment, type Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Highlighter } from "@lezer/highlight";
import { codeHighlighter, codeLanguage } from "../preview/highlight";

/**
 * Muted highlighting of code in fenced blocks (W-045), off by default. When on,
 * fences are parsed with the same Lezer parsers and `hl-*` classes as preview,
 * loaded on demand; `setup.ts`'s theme mutes the colours. When off, code isn't parsed.
 */
const off = markdown({ base: markdownLanguage });
const on = [
  markdown({ base: markdownLanguage, codeLanguages: codeLanguage }),
  syntaxHighlighting(inCode(codeHighlighter)),
];

/**
 * Applies `highlighter` inside code only. Its tags (`heading`, `url`,
 * `processingInstruction`) also mark Markdown, which `markdownStyling` styles.
 */
function inCode(highlighter: Highlighter): Highlighter {
  return {
    style: (tags) => highlighter.style(tags),
    scope: (top) => top.prop(languageDataProp) !== markdownLanguage.data,
  };
}

const code = new Compartment();

/** The Markdown language, with fenced code highlighted or not. */
export function markdownWithCode(highlight: boolean): Extension {
  return code.of(highlight ? on : off);
}

/** Turns code highlighting on or off in an open editor. */
export function setCodeHighlighting(view: EditorView, highlight: boolean) {
  const wanted = highlight ? on : off;
  // Reconfiguring the language reparses the whole document, so only when it changes.
  if (code.get(view.state) === wanted) return;
  view.dispatch({ effects: code.reconfigure(wanted) });
}
