import {
  cursorDocEnd,
  cursorDocStart,
  insertNewline,
  redo,
  selectDocEnd,
  undo,
} from "@codemirror/commands";
import {
  EditorSelection,
  type EditorState,
  type StateCommand,
  type SelectionRange,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  findNext,
  findPrevious,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { describe, expect, test } from "vitest";
import { createState } from "./setup";
import { setInset, toggleTypewriter } from "./typewriter";

const text = "First line.\nSecond line.\nThird line.";

/** A transaction on `text`, with typewriter scrolling on or off. */
function apply(spec: TransactionSpec, typewriter = true): Transaction {
  return createState(
    text,
    () => {},
    () => {},
    undefined,
    { typewriter },
  ).update(spec);
}

/** Where each scroll effect in `tr` puts the view: the position and how it's aligned. */
function scrolls(tr: Transaction): { head: number; y: string }[] {
  return tr.effects
    .map((e) => e.value as { range?: SelectionRange; y?: string })
    .filter(({ range }) => range)
    .map(({ range, y }) => ({ head: range!.head, y: y! }));
}

describe("typewriter scrolling", () => {
  test.each([true, false])("find and replace navigation respects typewriter mode (%s)", (typewriter) => {
    let state = createState(text, () => {}, () => {}, undefined, { typewriter });
    state = state.update({
      effects: setSearchQuery.of(new SearchQuery({ search: "line", replace: "paragraph" })),
    }).state;
    let dispatched: Transaction | undefined;
    const view = {
      get state() {
        return state;
      },
      plugin: () => null,
      dispatch: (spec: TransactionSpec) => {
        dispatched = state.update(spec);
        state = dispatched.state;
      },
    } as unknown as EditorView;
    for (const command of [findNext, findPrevious, replaceNext]) {
      expect(command(view)).toBe(true);
      expect(dispatched!.scrollIntoView).toBe(false);
      expect(scrolls(dispatched!).at(-1)).toEqual({
        head: state.selection.main.head,
        y: typewriter ? "center" : "nearest",
      });
    }
  });

  test("real editing, history, and document-navigation commands center their final caret", () => {
    let state = createState(text, () => {}, () => {}, undefined, { typewriter: true });
    const run = (command: StateCommand) => {
      let dispatched: Transaction | undefined;
      expect(
        command({
          state,
          dispatch: (tr) => {
            dispatched = tr;
            state = tr.state;
          },
        }),
      ).toBe(true);
      expect(scrolls(dispatched!)).toContainEqual({ head: state.selection.main.head, y: "center" });
    };

    run(cursorDocEnd);
    expect(state.selection.main.head).toBe(state.doc.length);
    run(insertNewline);
    expect(state.doc.lines).toBe(4);
    run(undo);
    expect(state.doc.lines).toBe(3);
    run(redo);
    expect(state.doc.lines).toBe(4);
    run(cursorDocStart);
    expect(state.selection.main.head).toBe(0);
    run(selectDocEnd);
    expect(state.selection.main.anchor).toBe(0);
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  test("centers the caret after typing", () => {
    const tr = apply({
      changes: { from: 5, insert: "!" },
      selection: { anchor: 6 },
      scrollIntoView: true,
    });
    expect(scrolls(tr)).toEqual([{ head: 6, y: "center" }]);
  });

  test("centers the caret when a key moves it", () => {
    const tr = apply({ selection: { anchor: 20 }, scrollIntoView: true });
    expect(scrolls(tr)).toEqual([{ head: 20, y: "center" }]);
  });

  test("centers a selection's moving end", () => {
    const tr = apply({
      selection: EditorSelection.range(30, 14),
      scrollIntoView: true,
    });
    expect(scrolls(tr)).toEqual([{ head: 14, y: "center" }]);
  });

  test("doesn't scroll while the mouse is selecting; it centers on release", () => {
    expect(apply({ selection: { anchor: 20 }, userEvent: "select.pointer" }).effects).toEqual([]);
  });

  test("leaves CodeMirror's own scrolling alone when off", () => {
    expect(apply({ selection: { anchor: 20 }, scrollIntoView: true }, false).effects).toEqual([]);
  });
});

describe("the padding that lets the first and last lines reach the middle", () => {
  /** The inline style typewriter scrolling puts on `.cm-content`, if any. */
  const padding = (state: EditorState) =>
    state
      .facet(EditorView.contentAttributes)
      .map((attrs) => (typeof attrs === "function" ? null : attrs.style))
      .find(Boolean);

  test("is applied by CodeMirror once measured, and goes when typewriter scrolling is turned off", () => {
    let state = createState(
      text,
      () => {},
      () => {},
      undefined,
      { typewriter: true },
    );
    expect(padding(state)).toBeUndefined();
    state = state.update({ effects: setInset.of(300) }).state;
    expect(padding(state)).toBe("padding-top: 300px; padding-bottom: 300px");
    state = state.update(toggleTypewriter(state, false)!).state;
    expect(padding(state)).toBeUndefined();
  });

  test("turning it off moves neither the caret nor the text", () => {
    const state = createState(
      text,
      () => {},
      () => {},
      undefined,
      { typewriter: true },
    ).update({
      selection: { anchor: 20 },
    }).state;
    const tr = state.update(toggleTypewriter(state, false)!);
    expect(tr.newSelection.main.head).toBe(20);
    expect(scrolls(tr)).toEqual([]);
  });

  test("toggling to the current setting does nothing", () => {
    const state = createState(
      text,
      () => {},
      () => {},
      undefined,
      { typewriter: true },
    );
    expect(toggleTypewriter(state, true)).toBeNull();
  });
});
