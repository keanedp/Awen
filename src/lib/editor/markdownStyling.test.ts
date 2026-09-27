import { describe, expect, test } from "vitest";
import { ensureSyntaxTree } from "@codemirror/language";
import { createState } from "./setup";
import { hangingHeadings } from "./markdownStyling";

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
