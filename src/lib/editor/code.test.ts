import { describe, expect, test } from "vitest";
import { ensureSyntaxTree, highlightingFor, languageDataProp } from "@codemirror/language";
import { markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { loadCodeLanguages } from "../preview/highlight";
import { setCodeHighlighting } from "./code";
import { countWords } from "./count";
import { createState } from "./setup";

const doc = "# Notes\n\n```js\nconst answer = 42; // why\n```\n\nText after.\n";
const inCode = doc.indexOf("const");

const open = (text: string, highlight: boolean) => createState(text, () => {}, () => {}, () => {}, highlight);

/** The innermost node at `pos`, once the whole document is parsed. */
function nodeAt(state: EditorState, pos: number) {
  return ensureSyntaxTree(state, state.doc.length, 5000)!.resolveInner(pos, 1);
}

/** The highlight classes the editor gives `tags` in the innermost language at `pos`. */
function classesAt(state: EditorState, pos: number, tags = [t.keyword]) {
  let top = nodeAt(state, pos);
  while (!top.type.isTop && top.parent) top = top.parent;
  return highlightingFor(state, tags, top.type) ?? "";
}

/** Enough of an `EditorView` to dispatch to, since tests have no DOM. */
function fakeView(state: EditorState) {
  const view = {
    state,
    dispatch: (spec: TransactionSpec) => (view.state = view.state.update(spec).state),
  };
  return view as typeof view & EditorView;
}

describe("code highlighting in the editor", () => {
  test("off by default: fenced code stays plain Markdown code text", async () => {
    await loadCodeLanguages(doc);
    const state = createState(doc, () => {}, () => {});
    expect(nodeAt(state, inCode).name).toBe("CodeText");
    expect(classesAt(state, inCode)).not.toContain("hl-keyword");
  });

  test("on: fenced code is parsed and gets preview's classes", async () => {
    await loadCodeLanguages(doc);
    const state = open(doc, true);
    const node = nodeAt(state, inCode);
    expect(node.name).toBe("const");
    expect(classesAt(state, inCode)).toContain("hl-keyword");
  });

  test("fences name languages as preview does: by extension, with attributes", async () => {
    const text = "```rs{1}\nfn main() {}\n```\n";
    await loadCodeLanguages(text);
    const state = open(text, true);
    expect(classesAt(state, text.indexOf("fn"))).toContain("hl-keyword");
  });

  test("Markdown itself never gets code classes", async () => {
    await loadCodeLanguages(doc);
    const state = open(doc, true);
    expect(state.doc.sliceString(0, 1)).toBe("#");
    expect(ensureSyntaxTree(state, 0)!.type.prop(languageDataProp)).toBe(markdownLanguage.data);
    // These tags mark Markdown too: `#` and headings, which markdownStyling styles.
    expect(classesAt(state, 0, [t.processingInstruction])).not.toContain("hl-");
    expect(classesAt(state, 0, [t.heading])).not.toContain("hl-");
  });

  test("an unknown language stays plain code", () => {
    const text = "```nosuchlanguage\nconst x\n```\n";
    expect(nodeAt(open(text, true), text.indexOf("const")).name).toBe("CodeText");
  });

  test("setCodeHighlighting turns it on and off, and does nothing when unchanged", async () => {
    await loadCodeLanguages(doc);
    const view = fakeView(open(doc, false));
    setCodeHighlighting(view, true);
    expect(nodeAt(view.state, inCode).name).toBe("const");
    const before = view.state;
    setCodeHighlighting(view, true);
    expect(view.state).toBe(before);
    setCodeHighlighting(view, false);
    expect(nodeAt(view.state, inCode).name).toBe("CodeText");
  });

  test("word count is the same with highlighting on, code comments included", async () => {
    await loadCodeLanguages(doc);
    const on = open(doc, true);
    nodeAt(on, 0);
    expect(countWords(on)).toBe(countWords(open(doc, false)));
    // Notes, const answer 42 why, Text after.
    expect(countWords(on)).toBe(7);
  });
});
