import { EditorSelection, type SelectionRange, type Transaction, type TransactionSpec } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { createState } from "./setup";

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
  return tr.effects.map((e) => {
    const { range, y } = e.value as { range: SelectionRange; y: string };
    return { head: range.head, y };
  });
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
