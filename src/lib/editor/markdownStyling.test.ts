import { describe, expect, test } from "vitest";
import { ensureSyntaxTree } from "@codemirror/language";
import { createState } from "./setup";
import { fencedCodeLines, hangingHeadings } from "./markdownStyling";

/** Each hanging heading in `text`, as its line number and marker length. */
function hanging(text: string, highlightCode = false) {
  const state = createState(text, () => {}, () => {}, () => {}, { highlightCode });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return hangingHeadings(state, [{ from: 0, to: state.doc.length }]).map(({ line, chars }) => [
    state.doc.lineAt(line).number,
    chars,
  ]);
}

describe("hanging headings", () => {
  test("every level hangs its whole marker and the space after it", () => {
    expect(hanging("# A\n## B\n### C\n#### D\n##### E\n###### F\n")).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ]);
  });

  test("closing marks, setext underlines and indented headings don't hang", () => {
    expect(hanging("## B ##\n\nTitle\n=====\n\n  ## Indented\n")).toEqual([[1, 3]]);
  });

  test("an empty heading hangs its marker", () => {
    expect(hanging("##\n")).toEqual([[1, 2]]);
  });

  test("a heading inside a highlighted Markdown code block doesn't hang", () => {
    expect(hanging("# A\n\n```md\n## Not a heading\n```\n", true)).toEqual([[1, 2]]);
  });
});

describe("fenced code lines", () => {
  function lines(text: string) {
    const state = createState(text, () => {}, () => {}, () => {}, {});
    ensureSyntaxTree(state, state.doc.length, 5000);
    return fencedCodeLines(state, [{ from: 0, to: state.doc.length }]).map(({ from, first, last }) => [
      state.doc.lineAt(from).number,
      first,
      last,
    ]);
  }

  test("every line of a fenced block, fences included", () => {
    expect(lines("a\n\n```js\nx\n```\n\nb\n")).toEqual([
      [3, true, false],
      [4, false, false],
      [5, false, true],
    ]);
  });

  test("an unclosed fence runs to the end", () => {
    expect(lines("```\nx")).toEqual([
      [1, true, false],
      [2, false, true],
    ]);
  });

  test("no code, no lines", () => {
    expect(lines("just text\n")).toEqual([]);
  });
});
