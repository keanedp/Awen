import { syntaxTree } from "@codemirror/language";
import { Facet, StateEffect, StateField, type EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { IterMode } from "@lezer/common";

/**
 * Spell checking with the system's checker (W-057). WebKit's own marks live on
 * the text nodes CodeMirror rewrites when it redraws a line, and it only
 * rechecks the word just typed, so misspellings vanished as you wrote. Here
 * the editor draws the marks as decorations, which redraws keep.
 */

/** A misspelled word in the document. */
export interface Misspelling {
  from: number;
  to: number;
  word: string;
}

/** The system spell checker (`spellchecker.ts`, through Rust); tests use a fake. */
export interface SpellChecker {
  /** The misspelled words in `text`, as [start, end) offsets. */
  check(text: string): Promise<[number, number][]>;
  /** Shows the suggestions menu for a misspelled word, at the pointer. */
  menu(view: EditorView, misspelling: Misspelling): void;
}

export const spellChecker = Facet.define<SpellChecker, SpellChecker | null>({
  combine: (checkers) => checkers[0] ?? null,
});

/** How long typing, scrolling or moving the caret must pause before the visible text is checked. */
const pause = 400;

/** Code, URLs, link labels, HTML and entities aren't prose. */
const skipped = new Set([
  "FencedCode",
  "CodeBlock",
  "InlineCode",
  "URL",
  "Autolink",
  "LinkLabel",
  "HTMLBlock",
  "HTMLTag",
  "CommentBlock",
  "Comment",
  "ProcessingInstructionBlock",
  "Entity",
]);

/**
 * The document from `from` to `to` for the checker, with what it shouldn't
 * check blanked out. Same length, with "\n" line breaks even in a CRLF file,
 * so an offset into it plus `from` is a document position.
 */
export function checkableText(state: EditorState, from: number, to: number): string {
  let text = state.doc.sliceString(from, to, "\n");
  syntaxTree(state).iterate({
    from,
    to,
    // A highlighted fence's code is skipped whole; don't walk its tree.
    mode: IterMode.IgnoreMounts,
    enter(node) {
      if (!skipped.has(node.name)) return;
      const start = Math.max(node.from, from) - from;
      const end = Math.min(node.to, to) - from;
      text = text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, " ") + text.slice(end);
      return false;
    },
  });
  return text;
}

const mark = Decoration.mark({ class: "cm-misspelled" });

const setMarks = StateEffect.define<{ from: number; to: number; marks: { from: number; to: number }[] }>();

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    if (tr.docChanged) {
      // An edited word is unmarked until the next check.
      const edited: [number, number][] = [];
      tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => edited.push([fromB, toB]));
      marks = marks.update({ filter: (from, to) => !edited.some(([a, b]) => from <= b && to >= a) });
    }
    for (const effect of tr.effects) {
      if (!effect.is(setMarks)) continue;
      const { from, to } = effect.value;
      marks = marks.update({
        filter: (f, t) => t < from || f > to,
        filterFrom: from,
        filterTo: to,
        add: effect.value.marks.map((m) => mark.range(m.from, m.to)),
        sort: true,
      });
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * The transaction that applies a check of `from`–`to`: the checker's `ranges`
 * (offsets into `checkableText`) replace the marks there. A new misspelling
 * with the caret in or at the end of it waits: it may still be being typed.
 * It's marked once the caret moves on, as in native text views.
 */
export function applyCheck(state: EditorState, from: number, to: number, ranges: [number, number][]): TransactionSpec {
  const current = state.field(marksField);
  const caret = state.selection.main;
  const marks = ranges
    .map(([start, end]) => ({ from: from + start, to: from + end }))
    .filter((m) => {
      if (!caret.empty || caret.head < m.from || caret.head > m.to) return true;
      let marked = false;
      current.between(m.from, m.to, (f, t) => {
        marked ||= f === m.from && t === m.to;
      });
      return marked;
    });
  return { effects: setMarks.of({ from, to, marks }) };
}

/** Every marked word, in document order. */
export function misspellings(state: EditorState): Misspelling[] {
  const found: Misspelling[] = [];
  state.field(marksField, false)?.between(0, state.doc.length, (from, to) => {
    found.push({ from, to, word: state.sliceDoc(from, to) });
  });
  return found;
}

/** The marked word at `pos`, if any. */
export function misspellingAt(state: EditorState, pos: number): Misspelling | null {
  return misspellings(state).find((m) => m.from <= pos && pos <= m.to) ?? null;
}

/** Replaces a misspelled word with a suggestion, unless the text there has changed since. */
export function correctSpelling(view: EditorView, misspelling: Misspelling, spelling: string): boolean {
  const { from, to, word } = misspelling;
  if (view.state.readOnly || view.state.sliceDoc(from, to) !== word) return false;
  view.dispatch({
    changes: { from, to, insert: spelling },
    selection: { anchor: from + spelling.length },
    userEvent: "input.spelling",
  });
  return true;
}

/** Checks the visible text again now, e.g. after Learn or Ignore Spelling. */
export function recheckSpelling(view: EditorView) {
  view.plugin(checking)?.schedule(0);
}

/** Whether the editor is checking spelling (Settings → Check spelling while typing). */
export function checksSpelling(state: EditorState): boolean {
  return state.field(marksField, false) !== undefined;
}

const checking = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined;
    destroyed = false;

    constructor(readonly view: EditorView) {
      this.schedule(pause);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        // Code blocks are only known once the parser reaches them.
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.schedule(pause);
      }
    }

    schedule(delay: number) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.check(), delay);
    }

    /** Checks the lines in the viewport (the visible text plus a margin). */
    async check() {
      const { view } = this;
      const { state } = view;
      const checker = state.facet(spellChecker);
      if (!checker) return;
      const from = state.doc.lineAt(view.viewport.from).from;
      const to = state.doc.lineAt(view.viewport.to).to;
      let ranges: [number, number][];
      try {
        ranges = await checker.check(checkableText(state, from, to));
      } catch {
        return;
      }
      // Typed meanwhile: the next pause checks again.
      if (this.destroyed || view.state.doc !== state.doc) return;
      view.dispatch(applyCheck(view.state, from, to, ranges));
    }

    destroy() {
      this.destroyed = true;
      clearTimeout(this.timer);
    }
  },
);

/** A right-click on a marked word selects it and shows the suggestions; elsewhere, the usual menu. */
const suggestions = EditorView.domEventHandlers({
  contextmenu(event, view) {
    const checker = view.state.facet(spellChecker);
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    const misspelling = pos === null ? null : misspellingAt(view.state, pos);
    if (!checker || !misspelling) return false;
    event.preventDefault();
    view.dispatch({ selection: { anchor: misspelling.from, head: misspelling.to } });
    checker.menu(view, misspelling);
    return true;
  },
});

/** Marks misspellings while on; the checker comes from the `spellChecker` facet. */
export const spelling: Extension = [marksField, checking, suggestions];
