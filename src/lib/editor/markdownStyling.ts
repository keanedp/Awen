import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { IterMode } from "@lezer/common";
import { tags as t } from "@lezer/highlight";

/**
 * Understated Markdown: headings stay body size but bold, and markup
 * characters (#, *, _, `, >) are dimmed rather than hidden.
 */
const style = HighlightStyle.define([
  { tag: t.processingInstruction, color: "var(--markup)" },
  { tag: t.heading, fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--text-muted)" },
  { tag: t.quote, color: "var(--text-muted)" },
  { tag: t.monospace, color: "var(--text-muted)" },
  { tag: t.contentSeparator, color: "var(--markup)" },
]);

/** A heading line whose marker ("## ") hangs, and the marker's length in characters. */
export interface HangingHeading {
  line: number;
  chars: number;
}

/**
 * The headings in `ranges` whose leading marker hangs in the left margin.
 * How far it hangs is up to the theme (`.cm-hanging-heading` in `setup.ts`).
 */
export function hangingHeadings(state: EditorState, ranges: readonly { from: number; to: number }[]) {
  const headings: HangingHeading[] = [];
  const doc = state.doc;
  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      // Not headings inside a highlighted ```md code block (W-045).
      mode: IterMode.IgnoreMounts,
      enter(node) {
        if (node.name !== "HeaderMark") return;
        const line = doc.lineAt(node.from);
        // Only the leading ATX marker; closing "##" and setext underlines stay put.
        if (node.from !== line.from || line.text[0] !== "#") return;
        const end = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
        headings.push({ line: line.from, chars: end - node.from });
      },
    });
  }
  return headings;
}

/** One line decoration per marker length, which the theme reads as `--hang`. */
const hangingLines = new Map<number, Decoration>();
function hangingLine(chars: number) {
  let deco = hangingLines.get(chars);
  if (!deco) {
    deco = Decoration.line({ class: "cm-hanging-heading", attributes: { style: `--hang: ${chars}` } });
    hangingLines.set(chars, deco);
  }
  return deco;
}

/** Hang heading markers ("## ") in the left margin so heading text aligns with body text. */
function hangingHeaders(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { line, chars } of hangingHeadings(view.state, view.visibleRanges)) builder.add(line, line, hangingLine(chars));
  return builder.finish();
}

const hangingHeadersPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hangingHeaders(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = hangingHeaders(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** The start of each line of each fenced code block in `ranges`, and whether it is the block's first or last line. */
export function fencedCodeLines(state: EditorState, ranges: readonly { from: number; to: number }[]) {
  const lines: { from: number; first: boolean; last: boolean }[] = [];
  const doc = state.doc;
  for (const { from, to } of ranges) {
    syntaxTree(state).iterate({
      from,
      to,
      mode: IterMode.IgnoreMounts,
      enter(node) {
        if (node.name !== "FencedCode") return;
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(node.to).number;
        for (let n = first; n <= last; n++) {
          const line = doc.line(n);
          // The viewport may start or end inside the block.
          if (line.to < from || line.from > to) continue;
          lines.push({ from: line.from, first: n === first, last: n === last });
        }
        return false;
      },
    });
  }
  return lines;
}

const codeLine = Decoration.line({ class: "cm-code-line" });
const codeFirst = Decoration.line({ class: "cm-code-line cm-code-first" });
const codeLast = Decoration.line({ class: "cm-code-line cm-code-last" });
const codeOnly = Decoration.line({ class: "cm-code-line cm-code-first cm-code-last" });

/** A light background behind fenced code blocks. */
function codeBlocks(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, first, last } of fencedCodeLines(view.state, view.visibleRanges)) {
    builder.add(from, from, first && last ? codeOnly : first ? codeFirst : last ? codeLast : codeLine);
  }
  return builder.finish();
}

const codeBlocksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = codeBlocks(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = codeBlocks(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const markdownStyling = [syntaxHighlighting(style), hangingHeadersPlugin, codeBlocksPlugin];
