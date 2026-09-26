import { EditorState } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { renderMarkdown } from "$lib/preview/render";
import { taskToggle } from "./tasks";

/** The text after toggling each 0-based line in turn, or null if one wasn't a task. */
function toggle(text: string, ...lines: number[]): string | null {
  let state = EditorState.create({ doc: text });
  for (const line of lines) {
    const changes = taskToggle(state.doc, line);
    if (!changes) return null;
    state = state.update({ changes }).state;
  }
  return state.sliceDoc();
}

describe("taskToggle", () => {
  test.each([
    ["- [ ] Buy milk", "- [x] Buy milk"],
    ["- [x] Buy milk", "- [ ] Buy milk"],
    ["- [X] Buy milk", "- [ ] Buy milk"],
    ["* [ ] Star", "* [x] Star"],
    ["+ [ ] Plus", "+ [x] Plus"],
    ["1. [ ] Ordered", "1. [x] Ordered"],
    ["12) [ ] Paren", "12) [x] Paren"],
    ["    - [ ] Nested", "    - [x] Nested"],
    ["> - [ ] Quoted", "> - [x] Quoted"],
    ["> > 2. [x] Twice quoted", "> > 2. [ ] Twice quoted"],
    ["- [ ] Has [ ] later", "- [x] Has [ ] later"],
  ])("%s", (before, after) => {
    expect(toggle(before, 0)).toBe(after);
  });

  test.each([
    "Plain text",
    "[ ] Not in a list",
    "- Not a task",
    "-[ ] No space after the marker",
    "- [y] Not a box",
    "# [ ] Heading",
  ])("ignores %s", (text) => {
    expect(toggle(text, 0)).toBeNull();
  });

  test("ignores lines outside the document", () => {
    const doc = EditorState.create({ doc: "- [ ] Only" }).doc;
    expect(taskToggle(doc, 1)).toBeNull();
    expect(taskToggle(doc, -1)).toBeNull();
  });

  test("only changes the given line", () => {
    expect(toggle("- [ ] One\n- [ ] Two\n- [ ] Three", 1)).toBe("- [ ] One\n- [x] Two\n- [ ] Three");
  });
});

describe("ticking in preview", () => {
  /** The `data-line` of each task item, in order, as Preview.svelte reads it on click. */
  function checkboxLines(text: string): number[] {
    const html = renderMarkdown(text, { preview: true });
    return [...html.matchAll(/<li class="task-list-item" data-line="(\d+)"><input/g)].map((m) => Number(m[1]));
  }

  test("every checkbox finds and ticks its own source line", () => {
    const text = [
      "# List",
      "",
      "- [ ] Top",
      "  - [x] Nested",
      "    continued",
      "- [ ] Next",
      "",
      "1. [ ] Ordered",
      "",
      "> - [ ] Quoted",
      "",
      "```",
      "- [ ] In code, not a task",
      "```",
    ].join("\n");
    const lines = checkboxLines(text);
    expect(lines).toEqual([2, 3, 5, 7, 9]);
    expect(toggle(text, ...lines)).toBe(
      text
        .replace("- [ ] Top", "- [x] Top")
        .replace("- [x] Nested", "- [ ] Nested")
        .replace("- [ ] Next", "- [x] Next")
        .replace("1. [ ] Ordered", "1. [x] Ordered")
        .replace("> - [ ] Quoted", "> - [x] Quoted"),
    );
  });

  test("checkboxes are only clickable in preview", () => {
    expect(renderMarkdown("- [ ] Task", { preview: true })).not.toContain("disabled");
    expect(renderMarkdown("- [ ] Task")).toContain('disabled=""');
  });

  test("ticking keeps CRLF line endings", () => {
    const text = "- [ ] One\r\n- [ ] Two\r\n";
    const state = EditorState.create({ doc: text, extensions: EditorState.lineSeparator.of("\r\n") });
    const changes = taskToggle(state.doc, checkboxLines(text)[1]);
    expect(state.update({ changes: changes! }).state.sliceDoc()).toBe("- [ ] One\r\n- [x] Two\r\n");
  });
});
