import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { Compartment, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import type { DimmedUnit } from "../settings";

/**
 * Focus mode (W-017): everything but the sentence or paragraph at the caret is
 * dimmed (`.cm-unfocused`). A `StateField` rather than a plugin, so it follows
 * every edit and selection change and can be tested without a DOM.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
const blank = (text: string) => text.trim() === "";

/**
 * What focus mode's Paragraph means: each heading, paragraph, code block,
 * table and so on is its own, blank lines or not. A list item's or quote's
 * text is its own paragraph, as it is in the Markdown tree.
 */
const blocks = new Set([
  "Paragraph",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "FencedCode",
  "CodeBlock",
  "Table",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstructionBlock",
  "LinkReference",
  "HorizontalRule",
]);

/** The innermost block from `blocks` around `node`, if any. */
function blockAround(node: SyntaxNode | null): SyntaxNode | null {
  for (; node; node = node.parent) if (blocks.has(node.name)) return node;
  return null;
}

/**
 * The Markdown block around `pos`, as whole lines, so a list or quote marker
 * before it isn't dimmed. On a blank line, nothing.
 */
function paragraphAt(state: EditorState, pos: number): { from: number; to: number } {
  const { doc } = state;
  const line = doc.lineAt(pos);
  if (blank(line.text)) return { from: pos, to: pos };
  // Code parsed for highlighting is mounted inside fences; `resolve` stays out of it.
  const tree = ensureSyntaxTree(state, line.to, 100) ?? syntaxTree(state);
  let block = blockAround(tree.resolve(pos, -1)) ?? blockAround(tree.resolve(pos, 1));
  // The caret is on the line but outside its block, e.g. before a list marker.
  if (!block || block.to < line.from || block.from > line.to) {
    block = null;
    tree.iterate({
      from: line.from,
      to: line.to,
      enter: (node) => {
        if (block) return false;
        if (blocks.has(node.name) && node.to >= line.from && node.from <= line.to) block = node.node;
      },
    });
  }
  if (!block) return { from: line.from, to: line.to };
  return { from: doc.lineAt(block.from).from, to: doc.lineAt(block.to).to };
}

/**
 * The sentence around `pos`. Sentences end at line breaks too, so each list
 * item or heading is one; the caret just after a full stop is still in its sentence.
 */
function sentenceAt(state: EditorState, pos: number): { from: number; to: number } {
  const line = state.doc.lineAt(pos);
  if (blank(line.text)) return { from: pos, to: pos };
  const offset = pos - line.from;
  let found = { index: 0, segment: "" };
  for (const { index, segment } of segmenter.segment(line.text)) {
    found = { index, segment };
    if (offset < index + segment.trimEnd().length + 1) break;
  }
  const from = line.from + found.index;
  return { from, to: from + found.segment.trimEnd().length };
}

/** The range left undimmed: the units at both ends of the main selection, and everything between. */
export function focusedRange(state: EditorState, unit: DimmedUnit): { from: number; to: number } {
  const at = unit === "sentence" ? sentenceAt : paragraphAt;
  const { from, to } = state.selection.main;
  return { from: at(state, from).from, to: at(state, to).to };
}

const unfocused = Decoration.mark({ class: "cm-unfocused" });

function dim(state: EditorState, unit: DimmedUnit): DecorationSet {
  const { from, to } = focusedRange(state, unit);
  const ranges = [];
  if (from > 0) ranges.push(unfocused.range(0, from));
  if (to < state.doc.length) ranges.push(unfocused.range(to, state.doc.length));
  return Decoration.set(ranges);
}

function focusField(unit: DimmedUnit) {
  return StateField.define<DecorationSet>({
    create: (state) => dim(state, unit),
    // Paragraphs come from the parse tree, so also when parsing catches up.
    update: (value, tr) =>
      tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState)
        ? dim(tr.state, unit)
        : value,
    provide: (field) => EditorView.decorations.from(field),
  });
}

const fields = { sentence: focusField("sentence"), paragraph: focusField("paragraph") };

/** Exported for tests: the dimmed ranges, or none when focus mode is off. */
export function dimmedRanges(state: EditorState): { from: number; to: number }[] {
  const field = Object.values(fields).find((f) => f === focus.get(state));
  if (!field) return [];
  const ranges: { from: number; to: number }[] = [];
  state.field(field).between(0, state.doc.length, (from, to) => void ranges.push({ from, to }));
  return ranges;
}

const focus = new Compartment();
const off: Extension = [];

/** Focus mode on the given unit, or off (`null`). */
export function focusMode(unit: DimmedUnit | null): Extension {
  return focus.of(unit ? fields[unit] : off);
}

/**
 * Turns focus mode on or off, or changes its unit, in an open editor. The text
 * stays where it is: turning it on or off rewraps nearly every line at once,
 * and WebKit moves the scroll position while CodeMirror does that (Chrome
 * doesn't), so it's put back before the frame is drawn.
 */
export function setFocusMode(view: EditorView, unit: DimmedUnit | null) {
  const wanted = unit ? fields[unit] : off;
  if (focus.get(view.state) === wanted) return;
  const { scrollTop } = view.scrollDOM;
  view.dispatch({ effects: focus.reconfigure(wanted) });
  if (view.scrollDOM.scrollTop !== scrollTop) view.scrollDOM.scrollTop = scrollTop;
}
