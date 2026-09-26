import { describe, expect, test } from "vitest";
import { EditorView } from "@codemirror/view";
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

  /** The text after pasting or dropping `text` at the end, through the editor's clipboard filters. */
  function paste(text: string, into: string): string {
    const { state } = open(into);
    const input = state.facet(EditorView.clipboardInputFilter).reduce((t, filter) => filter(t, state), text);
    return documentText({ state: state.update({ changes: { from: state.doc.length, insert: input } }).state });
  }

  test.each([
    ["LF into CRLF", "Two\nThree\n", "One\r\n", "One\r\nTwo\r\nThree\r\n"],
    ["CRLF into LF", "Two\r\nThree\r\n", "One\n", "One\nTwo\nThree\n"],
    ["old Mac CR into LF", "Two\rThree", "One\n", "One\nTwo\nThree"],
    ["mixed into CRLF", "a\nb\r\nc\rd", "One\r\n", "One\r\na\r\nb\r\nc\r\nd"],
    ["CRLF into CRLF", "Two\r\n", "One\r\n", "One\r\nTwo\r\n"],
    ["LF into LF", "Two\n", "One\n", "One\nTwo\n"],
  ])("pasting %s takes the file's line endings", (_, text, into, result) => {
    expect(paste(text, into)).toBe(result);
  });
});
