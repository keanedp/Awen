import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { IterMode } from "@lezer/common";

/**
 * Markdown syntax that isn't read as words: marks, URLs, link labels and
 * titles, images (alt text included), HTML tags and comments. Link text,
 * headings, list items and code are counted. Syntax is removed, as it is when
 * rendered, so a mark inside a word (`un*frigging*believable`) doesn't split it.
 */
const syntax = new Set([
  "HeaderMark",
  "ListMark",
  "QuoteMark",
  "TaskMarker",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "CodeInfo",
  "LinkMark",
  "URL",
  "LinkTitle",
  "LinkLabel",
  "LinkReference",
  "Image",
  "HTMLTag",
  "Comment",
  "CommentBlock",
  "ProcessingInstruction",
  "HorizontalRule",
  "Escape",
]);

/** Syntax that stands where no text is rendered, so it separates the words around it. */
const separators = new Set(["Image", "HorizontalRule", "CommentBlock", "LinkReference"]);

/** Average silent reading speed for non-fiction in English (Brysbaert, 2019). */
export const WORDS_PER_MINUTE = 238;

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

/**
 * A segment with a letter or digit is a word. Not `isWordLike`: JavaScriptCore
 * (WKWebView) reports numbers as not word-like, while V8 (WebView2, Node) doesn't.
 */
const wordLike = /[\p{L}\p{N}]/u;

/** Hyphens that join a compound into one word, as Word and Pages count it. */
const hyphens = new Set(["-", "\u2010", "\u2011"]);

/**
 * Words in the document, or in `ranges` (e.g. the selection), leaving out
 * Markdown syntax. Words are Unicode word segments with a letter or digit, so
 * "don't" and "3.14" are one word each and punctuation or emoji on their own
 * are none; "well-known" is one word.
 */
export function countWords(state: EditorState, ranges?: readonly { from: number; to: number }[]): number {
  ranges ??= [{ from: 0, to: state.doc.length }];
  // Parse as far as needed, within a time budget; past what's parsed, syntax counts as text.
  const end = Math.max(0, ...ranges.map((r) => r.to));
  const tree = ensureSyntaxTree(state, end, 50) ?? syntaxTree(state);
  let words = 0;
  for (const { from, to } of ranges) {
    if (from === to) continue;
    // "\n" line breaks, whatever the file uses, so string indices match document positions.
    const text = state.doc.sliceString(from, to, "\n").split("");
    tree.iterate({
      from,
      to,
      // Code parsed for highlighting (W-045) is counted as text; its `Comment`s aren't Markdown's.
      mode: IterMode.IgnoreMounts,
      enter(node) {
        if (!syntax.has(node.name)) return;
        // Of an escape (`\*`), only the backslash is syntax.
        const end = node.name === "Escape" ? node.from + 1 : node.to;
        const replacement = separators.has(node.name) ? " " : "";
        for (let i = Math.max(node.from, from); i < Math.min(end, to); i++) {
          if (text[i - from] !== "\n") text[i - from] = replacement;
        }
        return false;
      },
    });
    // A word straight after "word-" continues it rather than starting a new one.
    let afterWord = false;
    let joined = false;
    for (const { segment } of segmenter.segment(text.join(""))) {
      if (wordLike.test(segment)) {
        if (!joined) words++;
        afterWord = true;
        joined = false;
      } else {
        joined = afterWord && hyphens.has(segment);
        afterWord = false;
      }
    }
  }
  return words;
}

const number = new Intl.NumberFormat();

/**
 * The footer's text, e.g. "1,234 words · 6 min", or "12 of 1,234 words · < 1 min"
 * with a selection. Reading time is for what's counted: the selection if there is one.
 */
export function formatCount(words: number, selected: number | null = null): string {
  const counted = selected ?? words;
  const total = `${number.format(words)} ${words === 1 ? "word" : "words"}`;
  const label = selected === null ? total : `${number.format(selected)} of ${total}`;
  if (counted === 0) return label;
  const minutes = counted / WORDS_PER_MINUTE;
  return `${label} · ${minutes < 1 ? "< 1" : number.format(Math.round(minutes))} min`;
}
