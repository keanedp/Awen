import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type SelectionRange,
  type TransactionSpec,
} from "@codemirror/state";
import { IterMode, type SyntaxNode } from "@lezer/common";

/**
 * The Format menu (W-060): Markdown formatting applied to the selection. Each
 * command turns a state into one transaction, or null when there's nothing to do.
 */
export type FormatCommand = (state: EditorState) => TransactionSpec | null;

// Inline styles

type Inline = "bold" | "italic" | "strikethrough" | "highlight" | "code";

/**
 * Each style's marker, the characters that can form it, and how many of a run
 * of those characters belong to the style (0 if none). A run of three `*` is
 * bold and italic, so italic takes the odd one and bold a pair.
 */
const inline: Record<Inline, { mark: string; chars: string; take: (run: number) => number }> = {
  bold: { mark: "**", chars: "*_", take: (n) => (n >= 2 ? 2 : 0) },
  italic: { mark: "*", chars: "*_", take: (n) => n % 2 },
  strikethrough: { mark: "~~", chars: "~", take: (n) => (n >= 2 ? 2 : 0) },
  highlight: { mark: "==", chars: "=", take: (n) => (n >= 2 ? 2 : 0) },
  code: { mark: "`", chars: "`", take: (n) => Math.min(n, 1) },
};

/** How many `char`s end `text`. */
function runAtEnd(text: string, char: string): number {
  let n = 0;
  while (n < text.length && text[text.length - 1 - n] === char) n++;
  return n;
}

/** How many `char`s start `text`. */
function runAtStart(text: string, char: string): number {
  let n = 0;
  while (n < text.length && text[n] === char) n++;
  return n;
}

/** The length of `style`'s marker ending `before` and starting `after`, or 0 if it isn't on both sides. */
function markersAround(style: Inline, before: string, after: string): number {
  const { chars, take } = inline[style];
  for (const char of chars) {
    const n = take(runAtEnd(before, char));
    if (n && take(runAtStart(after, char)) === n) return n;
  }
  return 0;
}

/** A range over `from`–`to` facing the same way as `range`. */
function like(range: SelectionRange, from: number, to: number): SelectionRange {
  return range.head < range.anchor ? EditorSelection.range(to, from) : EditorSelection.range(from, to);
}

/**
 * Wraps each selection in `style`'s markers, or removes them if it already has
 * them (just outside or just inside the selection). Spaces at the ends of the
 * selection stay outside. An empty selection gets empty markers with the caret
 * between them; the command again removes them, or steps over a closing marker
 * just typed up to.
 */
export function toggleInline(state: EditorState, style: Inline): TransactionSpec {
  const { mark } = inline[style];
  const { doc } = state;
  return state.changeByRange((range) => {
    const lineStart = doc.lineAt(range.from).from;
    const lineEnd = doc.lineAt(range.to).to;
    const before = (at: number) => doc.sliceString(Math.max(lineStart, at - 8), at);
    const after = (at: number) => doc.sliceString(at, Math.min(lineEnd, at + 8));

    if (range.empty) {
      const at = range.head;
      const n = markersAround(style, before(at), after(at));
      if (n) return { changes: { from: at - n, to: at + n }, range: EditorSelection.cursor(at - n) };
      // Straight after a word, with the same marker earlier on the line: it closes a style.
      const typed = doc.sliceString(lineStart, at);
      for (const char of inline[style].chars) {
        const closing = inline[style].take(runAtStart(after(at), char));
        if (closing && /\S$/.test(typed) && typed.includes(char.repeat(closing))) {
          return { range: EditorSelection.cursor(at + closing) };
        }
      }
      return { changes: { from: at, insert: mark + mark }, range: EditorSelection.cursor(at + mark.length) };
    }

    const text = doc.sliceString(range.from, range.to);
    const from = range.from + (text.length - text.trimStart().length);
    const to = range.to - (text.length - text.trimEnd().length);
    if (from >= to) return { range };

    const outside = markersAround(style, before(from), after(to));
    if (outside) {
      return {
        changes: [
          { from: from - outside, to: from },
          { from: to, to: to + outside },
        ],
        range: like(range, from - outside, to - outside),
      };
    }
    const selected = doc.sliceString(from, to);
    const inside = markersAround(style, selected, selected);
    if (inside && to - from > inside * 2) {
      return {
        changes: [
          { from, to: from + inside },
          { from: to - inside, to },
        ],
        range: like(range, from, to - inside * 2),
      };
    }
    return {
      changes: [
        { from, insert: mark },
        { from: to, insert: mark },
      ],
      range: like(range, from + mark.length, to + mark.length),
    };
  });
}

// Line styles

type Block = "heading1" | "heading2" | "heading3" | "heading4" | "heading5" | "heading6" | "bullet" | "numbered" | "task";

/** A line's quote marks, indent, and heading or list marker. */
const linePrefix =
  /^((?:[ \t]{0,3}>[ \t]?)*)([ \t]*)(?:(#{1,6})(?:[ \t]+|$)|([-*+])[ \t]+\[[ xX]\](?:[ \t]+|$)|([-*+])(?:[ \t]+|$)|(\d{1,9})[.)](?:[ \t]+|$))?/;

interface Prefix {
  quote: string;
  indent: string;
  block: Block | null;
  /** The list marker character, kept when a bulleted line becomes a task and back. */
  bullet: string;
  /** Length of the whole prefix. */
  length: number;
}

function prefixOf(text: string): Prefix {
  const m = linePrefix.exec(text)!;
  const block: Block | null = m[3]
    ? (`heading${m[3].length}` as Block)
    : m[4]
      ? "task"
      : m[5]
        ? "bullet"
        : m[6]
          ? "numbered"
          : null;
  return { quote: m[1], indent: m[2], block, bullet: m[4] ?? m[5] ?? "-", length: m[0].length };
}

/** The first and last line numbers `range` touches. A selection ending at the start of a line leaves it out. */
function lineSpan(state: EditorState, range: SelectionRange): [number, number] {
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to).number;
  return [first, last > first && state.doc.line(last).from === range.to ? last - 1 : last];
}

/** The lines the selection touches, in order. */
function selectedLines(state: EditorState): Line[] {
  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const [first, last] = lineSpan(state, range);
    for (let n = first; n <= last; n++) numbers.add(n);
  }
  return [...numbers].sort((a, b) => a - b).map((n) => state.doc.line(n));
}

const blank = (line: Line) => !line.text.trim();

/** Applies line changes, moving carets at a line's start past a new marker. */
function lineChanges(state: EditorState, changes: ChangeSpec[]): TransactionSpec | null {
  if (!changes.length) return null;
  const set = state.changes(changes);
  return { changes: set, selection: state.selection.map(set, 1) };
}

/**
 * Makes every selected line a heading or list item, replacing any other
 * heading or list marker, or removes it if they all have it already. Blank
 * lines are left alone, unless only blank lines are selected. Numbered lists
 * count up from 1.
 */
export function toggleBlock(state: EditorState, block: Block): TransactionSpec | null {
  const lines = selectedLines(state);
  const targets = lines.every(blank) ? lines : lines.filter((line) => !blank(line));
  const prefixes = targets.map((line) => prefixOf(line.text));
  const remove = prefixes.every((p) => p.block === block);
  let number = 0;
  const changes = targets.flatMap((line, i): ChangeSpec[] => {
    const { quote, indent, bullet, length } = prefixes[i];
    let insert: string;
    if (remove) insert = block.startsWith("heading") ? quote : quote + indent;
    else if (block.startsWith("heading")) insert = quote + "#".repeat(Number(block.slice(-1))) + " ";
    else if (block === "bullet") insert = quote + indent + bullet + " ";
    else if (block === "task") insert = quote + indent + bullet + " [ ] ";
    else insert = quote + indent + `${++number}. `;
    return line.text.slice(0, length) === insert ? [] : [{ from: line.from, to: line.from + length, insert }];
  });
  return lineChanges(state, changes);
}

/** One level of quote marks. */
const quoteMark = /^[ \t]{0,3}>[ \t]?/;

/**
 * Quotes the selected lines, or unquotes them one level if they're all
 * quoted. Unlike headings and lists, quoting keeps what's inside.
 */
export function toggleQuote(state: EditorState): TransactionSpec | null {
  const lines = selectedLines(state);
  const text = lines.filter((line) => !blank(line));
  const quoted = (line: Line) => quoteMark.test(line.text);
  if ((text.length ? text : lines).every(quoted)) {
    return lineChanges(
      state,
      lines.filter(quoted).map((line) => ({ from: line.from, to: line.from + quoteMark.exec(line.text)![0].length })),
    );
  }
  // Blank lines between quoted ones get a bare ">", so it stays one quote.
  return lineChanges(
    state,
    lines
      .filter((line) => !quoted(line))
      .map((line) => ({ from: line.from, insert: blank(line) && lines.length > 1 ? ">" : "> " })),
  );
}

/** Makes the selected lines plain paragraphs: no quote, indent, heading or list marker. */
export function body(state: EditorState): TransactionSpec | null {
  return lineChanges(
    state,
    selectedLines(state).flatMap((line) => {
      const { length } = prefixOf(line.text);
      return length ? [{ from: line.from, to: line.from + length }] : [];
    }),
  );
}

// Blocks

const fenceLine = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;

/** The fenced code block around `pos`, if any. */
function fencedCodeAt(state: EditorState, pos: number): SyntaxNode | null {
  const tree = ensureSyntaxTree(state, pos, 100) ?? syntaxTree(state);
  // Both sides: at the end of a line (or the document) the block may only be to the left.
  for (const side of [1, -1] as const) {
    for (let node: SyntaxNode | null = tree.resolve(pos, side); node; node = node.parent) {
      if (node.name === "FencedCode") return node;
    }
  }
  return null;
}

/**
 * Puts the selected lines in a fenced code block, or takes them out of the one
 * the selection is in. An empty line becomes an empty block with the caret inside.
 */
export function toggleCodeBlock(state: EditorState): TransactionSpec | null {
  const { doc, lineBreak } = state;
  const range = state.selection.main;
  const block = fencedCodeAt(state, range.from);
  if (block) {
    const open = doc.lineAt(block.from);
    const close = doc.lineAt(block.to);
    const changes: ChangeSpec[] = [{ from: open.from, to: Math.min(open.to + 1, doc.length) }];
    if (close.number > open.number && fenceLine.test(close.text)) {
      changes.push({ from: close.from - 1, to: close.to });
    }
    return lineChanges(state, changes);
  }

  const [first, last] = lineSpan(state, range).map((n) => doc.line(n));
  // A longer fence than any inside, so code containing ``` stays in the block.
  const inner = doc.sliceString(first.from, last.to, "\n").match(/^[ \t]*`{3,}/gm) ?? [];
  const fence = "`".repeat(Math.max(3, ...inner.map((f) => f.trim().length + 1)));
  if (first.number === last.number && blank(first)) {
    return {
      changes: { from: first.from, to: first.to, insert: fence + lineBreak + lineBreak + fence },
      selection: EditorSelection.cursor(first.from + fence.length + 1),
    };
  }
  const changes = state.changes([
    { from: first.from, insert: fence + lineBreak },
    { from: last.to, insert: lineBreak + fence },
  ]);
  return {
    changes,
    selection: EditorSelection.create([like(range, changes.mapPos(range.from, 1), changes.mapPos(range.to, -1))]),
  };
}

/**
 * Makes each selection a link: selected text becomes `[text]()` with the caret
 * in the parentheses, a selected URL becomes `[](url)` with the caret in the
 * brackets, and nothing selected gives `[]()`.
 */
export function addLink(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const selected = state.doc.sliceString(range.from, range.to);
    const text = selected.trim();
    const from = range.from + (selected.length - selected.trimStart().length);
    const to = from + text.length;
    if (!text) {
      return { changes: { from: range.from, to: range.to, insert: "[]()" }, range: EditorSelection.cursor(range.from + 1) };
    }
    if (/^(?:[a-z][a-z\d+.-]*:\/\/|mailto:|www\.)\S+$/i.test(text)) {
      return {
        changes: [
          { from, insert: "[](" },
          { from: to, insert: ")" },
        ],
        range: EditorSelection.cursor(from + 1),
      };
    }
    return {
      changes: [
        { from, insert: "[" },
        { from: to, insert: "]()" },
      ],
      range: EditorSelection.cursor(to + 3),
    };
  });
}

/**
 * Adds a horizontal rule after the line with the caret, with a blank line
 * before it (straight under text, `---` would make that text a heading).
 * The caret goes to the line after it.
 */
export function addRule(state: EditorState): TransactionSpec {
  const { doc, lineBreak } = state;
  const line = doc.lineAt(state.selection.main.to);
  const underText = blank(line) ? line.number > 1 && !blank(doc.line(line.number - 1)) : true;
  const changes = state.changes({
    // A blank line's spaces go too.
    from: blank(line) ? line.from : line.to,
    to: line.to,
    insert: (blank(line) ? "" : lineBreak) + (underText ? lineBreak : "") + "---" + lineBreak,
  });
  return { changes, selection: EditorSelection.cursor(changes.mapPos(line.to, 1)) };
}

/**
 * Puts `text` in a block of its own after the line with the caret (or in place
 * of it, if it's blank), with a blank line on either side so it can't join the
 * paragraphs around it. Returns the changes and where `text` starts.
 */
function insertBlock(state: EditorState, text: string) {
  const { doc, lineBreak } = state;
  const line = doc.lineAt(state.selection.main.to);
  const empty = blank(line);
  const separated = empty && (line.number === 1 || blank(doc.line(line.number - 1)));
  const next = line.number < doc.lines ? doc.line(line.number + 1) : null;
  const lead = empty ? (separated ? "" : lineBreak) : lineBreak + lineBreak;
  const from = empty ? line.from : line.to;
  const changes = state.changes({
    from,
    to: line.to,
    insert: lead + text + (next && !blank(next) ? lineBreak : ""),
  });
  return { changes, start: from + lead.length };
}

/** The most columns and rows Add Table offers. */
export const tableLimits = { columns: 20, rows: 100 };

/** A whole number in 1..`max`, or `fallback` for anything else (an empty or non-numeric field). */
export function clampCount(value: unknown, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.trunc(n))) : fallback;
}

/**
 * An empty table of `columns` and `rows` (counting the heading row, so at
 * least one), with the caret in the first heading cell.
 */
export function addTable(state: EditorState, columns = 3, rows = 3): TransactionSpec {
  const cols = clampCount(columns, tableLimits.columns, 3);
  const body = clampCount(rows, tableLimits.rows, 3) - 1;
  const line = (cell: string) => "|" + `${cell}|`.repeat(cols);
  const lines = [line("  "), line(" --- "), ...Array.from({ length: body }, () => line("  "))];
  const { changes, start } = insertBlock(state, lines.join(state.lineBreak));
  return { changes, selection: EditorSelection.cursor(start + 2) };
}

/** A page break, `\newpage` on its own line. Print and PDF start a new page there. */
export function addPageBreak(state: EditorState): TransactionSpec {
  const { changes, start } = insertBlock(state, "\\newpage");
  return { changes, selection: EditorSelection.cursor(start + "\\newpage".length) };
}

/**
 * Adds a footnote: a reference after the selection and its definition at the
 * end of the document, numbered after the highest footnote there, with the
 * caret in the definition ready to type.
 */
export function addFootnote(state: EditorState): TransactionSpec {
  const { doc, lineBreak } = state;
  let highest = 0;
  for (const m of doc.sliceString(0, doc.length, "\n").matchAll(/\[\^(\d+)\]/g)) highest = Math.max(highest, Number(m[1]));
  const label = `[^${highest + 1}]`;
  const last = doc.line(doc.lines);
  // Blank lines at the end of the document, one of which can be the gap before the definition.
  const gap = blank(last) && state.selection.main.to < last.from;
  const separated = gap && doc.lines > 1 && blank(doc.line(doc.lines - 1));
  const before = gap ? (separated ? "" : lineBreak) : lineBreak + lineBreak;
  const changes = state.changes([
    { from: state.selection.main.to, insert: label },
    { from: gap ? last.from : doc.length, to: doc.length, insert: before + `${label}: ` },
  ]);
  return { changes, selection: EditorSelection.cursor(changes.newLength), scrollIntoView: true };
}

/** `date` as a long date in `locale` (the system's, by default): "September 29, 2026". */
export function formatDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale, { dateStyle: "long" });
}

/** Replaces each selection with today's date. */
export function addDate(state: EditorState, date = new Date(), locale?: string): TransactionSpec {
  const text = formatDate(date, locale);
  return state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: text },
    range: EditorSelection.cursor(range.from + text.length),
  }));
}

// Clear Styles

/** Syntax nodes whose marks Clear Styles removes. */
const styled = new Set(["Emphasis", "StrongEmphasis", "Strikethrough", "InlineCode", "Link"]);
const marks = new Set(["EmphasisMark", "StrikethroughMark", "CodeMark"]);

/**
 * Removes inline formatting from any styled text the selection touches (a
 * link keeps only its text), and heading, list and quote markers from its
 * lines. With nothing selected, it clears the whole line.
 */
export function clearStyles(state: EditorState): TransactionSpec | null {
  const { doc } = state;
  const cuts: [number, number][] = [];
  for (const range of state.selection.ranges) {
    const from = range.empty ? doc.lineAt(range.from).from : range.from;
    const to = range.empty ? doc.lineAt(range.to).to : range.to;
    const tree = ensureSyntaxTree(state, to, 100) ?? syntaxTree(state);
    tree.iterate({
      from,
      to,
      mode: IterMode.IgnoreMounts,
      enter(node) {
        if (!styled.has(node.name) || node.to <= from || node.from >= to) return;
        if (node.name === "Link") {
          const linkMarks = node.node.getChildren("LinkMark");
          if (linkMarks.length < 2) return;
          cuts.push([node.from, linkMarks[0].to], [linkMarks[1].from, node.to]);
          return;
        }
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (marks.has(child.name)) cuts.push([child.from, child.to]);
        }
      },
    });
    // Highlights aren't in the Markdown syntax tree.
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      const line = doc.line(n);
      for (const m of line.text.matchAll(/==(?=\S)(.*?\S)==/g)) {
        const start = line.from + m.index;
        const end = start + m[0].length;
        if (end > from && start < to) cuts.push([start, start + 2], [end - 2, end]);
      }
    }
  }
  for (const line of selectedLines(state)) {
    const { length } = prefixOf(line.text);
    if (length) cuts.push([line.from, line.from + length]);
  }
  if (!cuts.length) return null;

  // Line markers and inline marks can meet, so merge overlapping cuts.
  cuts.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of cuts) {
    const prev = merged[merged.length - 1];
    if (prev && from <= prev[1]) prev[1] = Math.max(prev[1], to);
    else merged.push([from, to]);
  }
  return lineChanges(
    state,
    merged.map(([from, to]) => ({ from, to })),
  );
}

/** The Format menu's commands, by menu item id. */
export const formatCommands: Record<string, FormatCommand> = {
  format_heading_1: (s) => toggleBlock(s, "heading1"),
  format_heading_2: (s) => toggleBlock(s, "heading2"),
  format_heading_3: (s) => toggleBlock(s, "heading3"),
  format_heading_4: (s) => toggleBlock(s, "heading4"),
  format_heading_5: (s) => toggleBlock(s, "heading5"),
  format_heading_6: (s) => toggleBlock(s, "heading6"),
  format_bulleted: (s) => toggleBlock(s, "bullet"),
  format_numbered: (s) => toggleBlock(s, "numbered"),
  format_task: (s) => toggleBlock(s, "task"),
  format_quote: toggleQuote,
  format_body: body,
  format_bold: (s) => toggleInline(s, "bold"),
  format_italic: (s) => toggleInline(s, "italic"),
  format_strikethrough: (s) => toggleInline(s, "strikethrough"),
  format_highlight: (s) => toggleInline(s, "highlight"),
  format_code: (s) => toggleInline(s, "code"),
  format_code_block: toggleCodeBlock,
  format_link: addLink,
  format_rule: addRule,
  format_footnote: addFootnote,
  format_page_break: addPageBreak,
  format_date: (s) => addDate(s),
  format_clear: clearStyles,
};
