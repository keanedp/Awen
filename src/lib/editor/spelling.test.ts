import { describe, expect, test } from "vitest";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { createState } from "./setup";
import { applyCheck, checkableText, correctSpelling, misspellingAt, misspellings } from "./spelling";

const open = (text: string) => createState(text, () => {}, () => {});

/** What the checker sees of `text`, with blanked-out characters shown as "_". */
function checked(text: string): string {
  const result = checkableText(open(text), 0, text.length);
  expect(result).toHaveLength(text.length);
  return result
    .split("")
    .map((c, i) => (c === " " && text[i] !== " " ? "_" : c))
    .join("");
}

/** The document after a check that found `words` (by their text) across all of it. */
function check(state: EditorState, ...words: string[]): EditorState {
  const text = state.doc.toString();
  const ranges = words.map((w): [number, number] => [text.indexOf(w), text.indexOf(w) + w.length]);
  return state.update(applyCheck(state, 0, state.doc.length, ranges)).state;
}

const marked = (state: EditorState) => misspellings(state).map((m) => m.word);

/** A stand-in for the view: enough state and dispatch for the functions under test. */
function viewOf(state: EditorState) {
  const view = {
    state,
    dispatch: (spec: TransactionSpec) => (view.state = view.state.update(spec).state),
  };
  return view as unknown as EditorView & { state: EditorState };
}

describe("checkableText", () => {
  test("leaves prose and Markdown punctuation alone", () => {
    const text = "# A heading\n\n> Some *emphasis*, **strong** and ~~struck~~.\n\n- [ ] A task";
    expect(checked(text)).toBe(text);
  });

  test.each([
    ["inline code", "Run `npm tset` now", "Run ____ _____ now"],
    ["a link's URL, not its text", "A [lnk](http://exmple.com) here", "A [lnk](_________________) here"],
    ["a reference link's label", "A [lnk][refrence] here", "A [lnk]__________ here"],
    ["an autolink", "See <http://exmple.com> now", "See ___________________ now"],
    ["a bare URL", "See http://exmple.com now", "See _________________ now"],
    ["an HTML tag", "Some <spn> tag", "Some _____ tag"],
    ["an entity", "Tom &amp; Jerry", "Tom _____ Jerry"],
  ])("blanks out %s", (_, text, result) => {
    expect(checked(text)).toBe(result);
  });

  test("blanks out a fenced code block but keeps its line breaks", () => {
    expect(checked("Text\n\n```js\nconst x = 1;\n```\n\nMore")).toBe("Text\n\n_____\n_____ _ _ __\n___\n\nMore");
  });

  test("blanks out an indented code block", () => {
    expect(checked("Text\n\n    codde here\n\nMore")).toBe("Text\n\n    _____ ____\n\nMore");
  });

  test("offsets are document positions in a CRLF file", () => {
    const state = open("One\r\nTwo `x` three\r\n");
    const text = checkableText(state, 0, state.doc.length);
    expect(text).toHaveLength(state.doc.length);
    expect(state.sliceDoc(text.indexOf("three"), text.indexOf("three") + 5)).toBe("three");
  });

  test("covers only the given range", () => {
    const state = open("First line\nSecond `code` line\nThird");
    const line = state.doc.line(2);
    expect(checkableText(state, line.from, line.to)).toBe(`Second ${" ".repeat(6)} line`);
  });
});

describe("marks", () => {
  test("a check marks the words it found", () => {
    expect(marked(check(open("this is splled wrongg\n"), "splled", "wrongg"))).toEqual(["splled", "wrongg"]);
  });

  test("a new check replaces the marks in its range only", () => {
    let state = check(open("splled\nwrongg\n"), "splled", "wrongg");
    state = state.update(applyCheck(state, 0, 6, [])).state;
    expect(marked(state)).toEqual(["wrongg"]);
  });

  test("marks stay on their words when text is typed elsewhere", () => {
    let state = check(open("An splled word\n"), "splled");
    state = state.update({ changes: { from: 0, insert: "Now " } }).state;
    expect(marked(state)).toEqual(["splled"]);
    expect(misspellings(state)[0].from).toBe(7);
  });

  test("editing a marked word unmarks it until the next check", () => {
    let state = check(open("An splled word\n"), "splled");
    state = state.update({ changes: { from: 5, insert: "e" } }).state;
    expect(marked(state)).toEqual([]);
  });

  test("typing right after a marked word unmarks it", () => {
    let state = check(open("An splled word\n"), "splled");
    state = state.update({ changes: { from: 9, insert: "d" } }).state;
    expect(marked(state)).toEqual([]);
  });

  test("a new misspelling at the caret waits until the caret moves on", () => {
    let state = open("Typing splled");
    state = state.update({ selection: { anchor: state.doc.length } }).state;
    state = check(state, "splled");
    expect(marked(state)).toEqual([]);
    state = state.update({ changes: { from: state.doc.length, insert: " " }, selection: { anchor: 14 } }).state;
    expect(marked(check(state, "splled"))).toEqual(["splled"]);
  });

  test("a marked word keeps its mark when the caret is put in it", () => {
    let state = check(open("An splled word"), "splled");
    state = state.update({ selection: { anchor: 5 } }).state;
    expect(marked(check(state, "splled"))).toEqual(["splled"]);
  });

  test("misspellingAt finds the marked word at a position", () => {
    const state = check(open("An splled word"), "splled");
    expect(misspellingAt(state, 5)).toEqual({ from: 3, to: 9, word: "splled" });
    expect(misspellingAt(state, 11)).toBeNull();
  });
});

describe("correctSpelling", () => {
  test("replaces the word and puts the caret after it", () => {
    const view = viewOf(check(open("An splled word"), "splled"));
    expect(correctSpelling(view, misspellingAt(view.state, 5)!, "spelled")).toBe(true);
    expect(view.state.doc.toString()).toBe("An spelled word");
    expect(view.state.selection.main.head).toBe(10);
    expect(marked(view.state)).toEqual([]);
  });

  test("does nothing if the text there has changed", () => {
    const view = viewOf(check(open("An splled word"), "splled"));
    const misspelling = misspellingAt(view.state, 5)!;
    view.dispatch({ changes: { from: 3, to: 9, insert: "other" } });
    expect(correctSpelling(view, misspelling, "spelled")).toBe(false);
    expect(view.state.doc.toString()).toBe("An other word");
  });
});
