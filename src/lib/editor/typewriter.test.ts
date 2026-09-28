import {
  EditorSelection,
  type EditorState,
  type SelectionRange,
  type Transaction,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
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
  test("centres the caret after typing", () => {
    const tr = apply({
      changes: { from: 5, insert: "!" },
      selection: { anchor: 6 },
      scrollIntoView: true,
    });
    expect(scrolls(tr)).toEqual([{ head: 6, y: "center" }]);
  });

  test("centres the caret when a key moves it", () => {
    const tr = apply({ selection: { anchor: 20 }, scrollIntoView: true });
    expect(scrolls(tr)).toEqual([{ head: 20, y: "center" }]);
  });

  test("centres a selection's moving end", () => {
    const tr = apply({
      selection: EditorSelection.range(30, 14),
      scrollIntoView: true,
    });
    expect(scrolls(tr)).toEqual([{ head: 14, y: "center" }]);
  });

  test("doesn't scroll while the mouse is selecting; it centres on release", () => {
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
