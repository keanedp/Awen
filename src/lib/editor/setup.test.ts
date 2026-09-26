import { describe, expect, test } from "vitest";
import { createState, documentText } from "./setup";

const open = (text: string) => ({ state: createState(text, () => {}, () => {}) });

describe("line endings", () => {
  test.each([
    ["LF", "# Title\n\nFirst line\nSecond line\n"],
    ["CRLF", "# Title\r\n\r\nFirst line\r\nSecond line\r\n"],
    ["no trailing newline", "One\r\nTwo"],
    ["empty", ""],
  ])("%s round-trips byte for byte", (_, text) => {
    expect(documentText(open(text))).toBe(text);
  });

  test("a new line typed into a CRLF file is CRLF", () => {
    const doc = open("One\r\nTwo\r\n");
    const state = doc.state.update({ changes: { from: 3, insert: doc.state.lineBreak + "Added" } }).state;
    expect(documentText({ state })).toBe("One\r\nAdded\r\nTwo\r\n");
  });

  // W-050: with lineSeparator set, CodeMirror only splits pasted text on the
  // file's own separator. Swap `test.fails` for `test` once that's fixed.
  test.fails("pasted LF text takes the file's CRLF endings", () => {
    const { state } = open("One\r\n");
    const pasted = state.update({ changes: { from: state.doc.length, insert: state.toText("Two\nThree\n") } }).state;
    expect(documentText({ state: pasted })).toBe("One\r\nTwo\r\nThree\r\n");
  });

  test.fails("pasted CRLF text takes the file's LF endings", () => {
    const { state } = open("One\n");
    const pasted = state.update({ changes: { from: state.doc.length, insert: state.toText("Two\r\nThree\r\n") } }).state;
    expect(documentText({ state: pasted })).toBe("One\nTwo\nThree\n");
  });
});
