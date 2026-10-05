import { EditorState } from "@codemirror/state";
import { SearchQuery, getSearchQuery, search, setSearchQuery } from "@codemirror/search";
import { describe, expect, test } from "vitest";
import { applyFindOptions, editFindQuery } from "./findQuery";
import { findSelection } from "./find";
import type { EditorView } from "@codemirror/view";

function matches(query: SearchQuery, doc = "Cat cat scatter CAT cat2") {
  const cursor = query.getCursor(EditorState.create({ doc }));
  const found: number[] = [];
  for (let match = cursor.next(); !match.done; match = cursor.next()) found.push(match.value.from);
  return found;
}

describe("find matching options", () => {
  const query = new SearchQuery({ search: "cat", literal: true });
  test("default ignores case and matches inside words", () => {
    expect(matches(query)).toEqual([0, 4, 9, 16, 20]);
  });
  test("match case", () => {
    expect(matches(applyFindOptions(query, { findMatchCase: true }))).toEqual([4, 9, 20]);
  });
  test("whole words", () => {
    expect(matches(applyFindOptions(query, { findWholeWord: true }))).toEqual([0, 4, 16]);
  });
  test("both options", () => {
    expect(matches(applyFindOptions(query, { findWholeWord: true, findMatchCase: true }))).toEqual([4]);
  });
  test("changing search or replacement preserves both options and literal text", () => {
    const changed = editFindQuery(new SearchQuery({ search: "old", caseSensitive: true, wholeWord: true }), "a.b", "new");
    expect(changed.caseSensitive).toBe(true);
    expect(changed.wholeWord).toBe(true);
    expect(changed.replace).toBe("new");
    expect(matches(changed, "a.b axb A.B")).toEqual([0]);
  });
  test("changing one option preserves the other, query and replacement", () => {
    const changed = applyFindOptions(new SearchQuery({ search: "cat", replace: "dog", wholeWord: true }), { findMatchCase: true });
    expect(changed.wholeWord).toBe(true);
    expect(changed.search).toBe("cat");
    expect(changed.replace).toBe("dog");
  });
});

test("Use Selection for Find preserves options and normalizes a CRLF selection for matching", () => {
  let state = EditorState.create({
    doc: "first\r\nsecond\r\nfirst\r\nsecond",
    selection: { anchor: 0, head: 12 },
    extensions: [EditorState.lineSeparator.of("\r\n"), search()],
  });
  state = state.update({ effects: setSearchQuery.of(new SearchQuery({ search: "old", caseSensitive: true, wholeWord: true })) }).state;
  const view = { get state() { return state; }, dispatch(spec: Parameters<EditorState["update"]>[0]) { state = state.update(spec).state; } };
  findSelection(view as unknown as EditorView);
  const query = getSearchQuery(state);
  expect(query.search).toBe("first\nsecond");
  expect(query.caseSensitive).toBe(true);
  expect(query.wholeWord).toBe(true);
  expect(matches(query, "first\nsecond\nfirst\nsecond")).toEqual([0, 13]);
});
