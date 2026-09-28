import { EditorSelection, type EditorState } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { createState } from "./setup";
import { dimmedRanges, focusedRange } from "./focus";
import { loadCodeLanguages } from "../preview/highlight";
import type { FocusUnit } from "../settings";

/** A state with the caret at `|`, or the selection between two `|`s. */
function open(marked: string, focus: FocusUnit | null = "sentence", highlightCode = false): EditorState {
  const [from, to = from] = [...marked.matchAll(/\|/g)].map((m, i) => m.index - i);
  const state = createState(marked.replaceAll("|", ""), () => {}, () => {}, undefined, { focus, highlightCode });
  return state.update({ selection: EditorSelection.range(from, to) }).state;
}

/** The text focus mode leaves undimmed. */
function focused(marked: string, unit: FocusUnit, highlightCode = false): string {
  const state = open(marked, unit, highlightCode);
  const { from, to } = focusedRange(state, unit);
  return state.sliceDoc(from, to);
}

describe("sentence", () => {
  const text = "First one. Second one? Third one!";

  test.each([
    ["at the start", "|First one. Second one? Third one!", "First one."],
    ["inside it", "First one. Sec|ond one? Third one!", "Second one?"],
    ["just after its full stop", "First one.| Second one? Third one!", "First one."],
    ["at the start of the next", "First one. |Second one? Third one!", "Second one?"],
    ["at the end of the line", "First one. Second one? Third one!|", "Third one!"],
  ])("with the caret %s", (_, marked, sentence) => {
    expect(marked.replace("|", "")).toBe(text);
    expect(focused(marked, "sentence")).toBe(sentence);
  });

  test("ends at the end of a line, so each list item or heading is one", () => {
    expect(focused("# A head|ing\nSome text", "sentence")).toBe("# A heading");
    expect(focused("- one\n- t|wo\n- three", "sentence")).toBe("- two");
  });

  test("is still being written when the caret is at its end", () => {
    expect(focused("Done. Now I am typi|", "sentence")).toBe("Now I am typi");
  });

  test("covers every sentence a selection touches", () => {
    expect(focused("One. T|wo. Three. Fo|ur. Five.", "sentence")).toBe("Two. Three. Four.");
  });
});

describe("paragraph", () => {
  test("is the run of lines between blank lines", () => {
    const text = "Before.\n\nFirst line.\nSec|ond line.\n\nAfter.";
    expect(focused(text, "paragraph")).toBe("First line.\nSecond line.");
  });

  test("runs to the start and end of the document", () => {
    expect(focused("One.\nT|wo.", "paragraph")).toBe("One.\nTwo.");
  });

  test("each heading is its own, even without blank lines between them", () => {
    const headings = "# Title\n## Sec|tion\n### Sub";
    expect(focused(headings, "paragraph")).toBe("## Section");
    expect(focused("# Title|\n## Section", "paragraph")).toBe("# Title");
    expect(focused("# Title\n|## Section", "paragraph")).toBe("## Section");
  });

  test("a heading and the text right under it are separate", () => {
    expect(focused("# Tit|le\nSome text.\nMore.", "paragraph")).toBe("# Title");
    expect(focused("# Title\nSome te|xt.\nMore.", "paragraph")).toBe("Some text.\nMore.");
  });

  test("a Setext heading is one, underline included", () => {
    expect(focused("Tit|le\n=====\nText.", "paragraph")).toBe("Title\n=====");
  });

  test("each list item is its own, marker included", () => {
    expect(focused("- one\n- t|wo\n- three", "paragraph")).toBe("- two");
    expect(focused("- one\n|- two\n- three", "paragraph")).toBe("- two");
    expect(focused("1. one\n2. two|", "paragraph")).toBe("2. two");
  });

  test("a code block is one, blank lines inside it included", () => {
    const text = "Text.\n```js\nconst a = 1;\n\nconst b| = 2;\n```\nMore.";
    expect(focused(text, "paragraph")).toBe("```js\nconst a = 1;\n\nconst b = 2;\n```");
  });

  test("a code block is one with code highlighting on too", async () => {
    const text = "Text.\n```js\nconst a = 1;\n\nconst b| = 2;\n```\nMore.";
    await loadCodeLanguages(text);
    expect(focused(text, "paragraph", true)).toBe("```js\nconst a = 1;\n\nconst b = 2;\n```");
  });

  test("a quote's text is one, markers included", () => {
    expect(focused("> One\n> T|wo\n\nAfter.", "paragraph")).toBe("> One\n> Two");
  });

  test("is nothing on a blank line, so everything is dimmed", () => {
    const state = open("One.\n\n|\n\nTwo.", "paragraph");
    expect(dimmedRanges(state)).toEqual([
      { from: 0, to: 6 },
      { from: 6, to: 12 },
    ]);
  });

  test("works in CRLF files", () => {
    expect(focused("Before.\r\n\r\nFir|st.\r\nSecond.\r\n\r\nAfter.", "paragraph")).toBe("First.\r\nSecond.");
    expect(focused("# One\r\n## Tw|o\r\nText.", "paragraph")).toBe("## Two");
  });
});

describe("dimming", () => {
  test("dims everything before and after the focused unit", () => {
    const state = open("One. Tw|o. Three.");
    expect(dimmedRanges(state)).toEqual([
      { from: 0, to: 5 },
      { from: 9, to: 16 },
    ]);
  });

  test("follows the caret and the text as you type", () => {
    let state = open("One. Tw|o. Three.");
    state = state.update({ selection: { anchor: 1 } }).state;
    expect(dimmedRanges(state)).toEqual([{ from: 4, to: 16 }]);
    state = state.update({ changes: { from: 4, insert: " More." }, selection: { anchor: 10 } }).state;
    const [before, after] = dimmedRanges(state);
    expect(state.sliceDoc(before.to, after.from)).toBe("More.");
  });

  test("dims nothing when focus mode is off", () => {
    expect(dimmedRanges(open("One. Tw|o. Three.", null))).toEqual([]);
  });

  test("dims nothing in a single-sentence document", () => {
    expect(dimmedRanges(open("Just o|ne."))).toEqual([]);
  });
});
