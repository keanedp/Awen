import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
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

const hangingMark = Decoration.mark({ class: "cm-hanging-mark" });

/** Hang heading markers ("## ") in the left margin so heading text aligns with body text. */
function hangingHeaders(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "HeaderMark") return;
        const line = doc.lineAt(node.from);
        // Only the leading ATX marker; closing "##" and setext underlines stay put.
        if (node.from !== line.from || line.text[0] !== "#") return;
        const end = doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
        builder.add(node.from, end, hangingMark);
      },
    });
  }
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

export const markdownStyling = [syntaxHighlighting(style), hangingHeadersPlugin];
