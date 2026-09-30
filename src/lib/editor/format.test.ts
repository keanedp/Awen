import { isolateHistory, undo } from "@codemirror/commands";
import { EditorSelection, type EditorState, type SelectionRange } from "@codemirror/state";
import { describe, expect, test } from "vitest";
import { addDate, formatCommands, formatDate } from "./format";
import { createState, documentText } from "./setup";

/**
 * Runs Format menu item `id` on `text`, where «…» marks a selection (several
 * allowed) and ‸ a caret, and returns the result marked the same way, or null
 * if the command did nothing. `lineBreak` sets the file's line endings.
 */
function format(id: string, text: string, lineBreak = "\n"): string | null {
  const ranges: SelectionRange[] = [];
  let doc = "";
  let start = 0;
  for (const char of text) {
    if (char === "«") start = doc.length;
    else if (char === "»") ranges.push(EditorSelection.range(start, doc.length));
    else if (char === "‸") ranges.push(EditorSelection.cursor(doc.length));
    else doc += char;
  }
  let state = createState(doc.replaceAll("\n", lineBreak), () => {}, () => {});
  state = state.update({ selection: EditorSelection.create(ranges.length ? ranges : [EditorSelection.cursor(0)]) }).state;
  const spec = formatCommands[id](state);
  if (!spec) return null;
  return marked(state.update(spec).state);
}

/** The document with its selection marked as `format` takes it. */
function marked(state: EditorState): string {
  let out = state.doc.toString();
  for (const range of [...state.selection.ranges].reverse()) {
    out = range.empty
      ? out.slice(0, range.from) + "‸" + out.slice(range.from)
      : out.slice(0, range.from) + "«" + out.slice(range.from, range.to) + "»" + out.slice(range.to);
  }
  return out;
}

describe("inline styles", () => {
  test.each([
    ["format_bold", "Some «words» here", "Some **«words»** here"],
    ["format_italic", "Some «words» here", "Some *«words»* here"],
    ["format_strikethrough", "Some «words» here", "Some ~~«words»~~ here"],
    ["format_highlight", "Some «words» here", "Some ==«words»== here"],
    ["format_code", "Some «words» here", "Some `«words»` here"],
  ])("%s wraps the selection", (id, before, after) => {
    expect(format(id, before)).toBe(after);
  });

  test.each([
    ["format_bold", "Some **«words»** here", "Some «words» here"],
    ["format_bold", "Some «**words**» here", "Some «words» here"],
    ["format_bold", "Some __«words»__ here", "Some «words» here"],
    ["format_italic", "Some *«words»* here", "Some «words» here"],
    ["format_italic", "Some _«words»_ here", "Some «words» here"],
    ["format_italic", "Some «*words*» here", "Some «words» here"],
    ["format_strikethrough", "Some ~~«words»~~ here", "Some «words» here"],
    ["format_highlight", "Some «==words==» here", "Some «words» here"],
    ["format_code", "Some `«words»` here", "Some «words» here"],
  ])("%s removes the style it already has: %s", (id, before, after) => {
    expect(format(id, before)).toBe(after);
  });

  test("bold and italic come apart", () => {
    expect(format("format_bold", "***«words»***")).toBe("*«words»*");
    expect(format("format_italic", "***«words»***")).toBe("**«words»**");
  });

  test("italic doesn't take bold's asterisks for its own", () => {
    expect(format("format_italic", "**«words»**")).toBe("***«words»***");
    expect(format("format_italic", "«**words**»")).toBe("*«**words**»*");
  });

  test("spaces at the ends of the selection stay outside", () => {
    expect(format("format_bold", "Some« words »here")).toBe("Some **«words»** here");
  });

  test("a selection of only spaces is left alone", () => {
    expect(format("format_bold", "Some« »here")).toBe("Some« »here");
  });

  test("a backwards selection stays backwards", () => {
    const state = createState("Some words", () => {}, () => {});
    const selected = state.update({ selection: EditorSelection.single(10, 5) }).state;
    const range = selected.update(formatCommands.format_bold(selected)!).state.selection.main;
    expect([range.anchor, range.head]).toEqual([12, 7]);
  });

  test("with no selection, inserts empty markers with the caret between them", () => {
    expect(format("format_bold", "Some ‸here")).toBe("Some **‸**here");
    expect(format("format_code", "‸")).toBe("`‸`");
  });

  test("again with the caret between empty markers removes them", () => {
    expect(format("format_bold", "Some **‸**here")).toBe("Some ‸here");
    expect(format("format_italic", "Some *‸*here")).toBe("Some ‸here");
  });

  test("again after typing steps over the closing marker", () => {
    expect(format("format_bold", "Some **word‸** here")).toBe("Some **word**‸ here");
    expect(format("format_italic", "Some *word‸* here")).toBe("Some *word*‸ here");
    // Not bold's closing marker for italic.
    expect(format("format_italic", "Some **word‸** here")).toBe("Some **word*‸*** here");
  });
});

describe("headings and lists", () => {
  test.each([
    ["format_heading_1", "Title‸", "# Title‸"],
    ["format_heading_3", "Title‸", "### Title‸"],
    ["format_heading_2", "# Title‸", "## Title‸"],
    ["format_heading_2", "- Title‸", "## Title‸"],
    ["format_heading_1", "  Indented‸", "# Indented‸"],
    ["format_bulleted", "Item‸", "- Item‸"],
    ["format_bulleted", "## Item‸", "- Item‸"],
    ["format_bulleted", "1. Item‸", "- Item‸"],
    ["format_task", "Item‸", "- [ ] Item‸"],
    ["format_task", "* Item‸", "* [ ] Item‸"],
    ["format_bulleted", "* [x] Item‸", "* Item‸"],
    ["format_numbered", "- Item‸", "1. Item‸"],
    ["format_bulleted", "  Nested‸", "  - Nested‸"],
    ["format_bulleted", "> Quoted‸", "> - Quoted‸"],
    ["format_heading_1", "> Quoted‸", "> # Quoted‸"],
  ])("%s: %s", (id, before, after) => {
    expect(format(id, before)).toBe(after);
  });

  test.each([
    ["format_heading_2", "## Title‸", "Title‸"],
    ["format_bulleted", "- Item‸", "Item‸"],
    ["format_bulleted", "  * Nested‸", "  Nested‸"],
    ["format_task", "- [x] Done‸", "Done‸"],
    ["format_numbered", "3) Item‸", "Item‸"],
    ["format_bulleted", "> - Quoted‸", "> Quoted‸"],
  ])("%s removes its own marker: %s", (id, before, after) => {
    expect(format(id, before)).toBe(after);
  });

  test("apply to every selected line, skipping blank ones", () => {
    expect(format("format_bulleted", "«One\nTwo\n\nThree»")).toBe("- «One\n- Two\n\n- Three»");
  });

  test("numbered lists count up from 1", () => {
    expect(format("format_numbered", "«One\n- Two\n7. Three»")).toBe("1. «One\n2. Two\n3. Three»");
  });

  test("mixed lines all get the style, then lose it", () => {
    const once = format("format_bulleted", "«- One\nTwo»")!;
    expect(once).toBe("«- One\n- Two»");
    expect(format("format_bulleted", once)).toBe("«One\nTwo»");
  });

  test("a selection ending at the start of a line leaves that line out", () => {
    expect(format("format_bulleted", "«One\n»Two")).toBe("- «One\n»Two");
  });

  test("an empty line becomes an empty item with the caret after the marker", () => {
    expect(format("format_bulleted", "‸")).toBe("- ‸");
    expect(format("format_heading_1", "Text\n‸")).toBe("Text\n# ‸");
  });

  test("the caret at the start of a line stays with the text", () => {
    expect(format("format_bulleted", "‸Item")).toBe("- ‸Item");
  });

  test("#hashtags and *emphasis* at the start of a line aren't markers", () => {
    expect(format("format_bulleted", "#tag‸")).toBe("- #tag‸");
    expect(format("format_bulleted", "*word* here‸")).toBe("- *word* here‸");
  });

  test("Body removes quotes, indents, headings and list markers", () => {
    expect(format("format_body", "«# One\n> - [ ] Two\n    Three\n4. Four»")).toBe("«One\nTwo\nThree\nFour»");
    expect(format("format_body", "Plain‸")).toBeNull();
  });
});

describe("blockquote", () => {
  test("quotes the selected lines, with a bare > on blank lines between", () => {
    expect(format("format_quote", "«One\n\nTwo»")).toBe("> «One\n>\n> Two»");
  });

  test("keeps what's inside", () => {
    expect(format("format_quote", "# Title‸")).toBe("> # Title‸");
  });

  test("unquotes one level when every line is quoted", () => {
    expect(format("format_quote", "«> One\n>\n> > Two»")).toBe("«One\n\n> Two»");
  });

  test("quotes only the unquoted lines of a mixed selection", () => {
    expect(format("format_quote", "«> One\nTwo»")).toBe("«> One\n> Two»");
  });

  test("an empty line gets a quote to type into", () => {
    expect(format("format_quote", "‸")).toBe("> ‸");
  });
});

describe("code block", () => {
  test("fences the selected lines, keeping the selection", () => {
    expect(format("format_code_block", "Intro\n«let a = 1;\nlet b = 2;»\nEnd")).toBe(
      "Intro\n```\n«let a = 1;\nlet b = 2;»\n```\nEnd",
    );
  });

  test("an empty line becomes an empty block with the caret inside", () => {
    expect(format("format_code_block", "Text\n‸")).toBe("Text\n```\n‸\n```");
  });

  test("uses a longer fence than any inside", () => {
    expect(format("format_code_block", "«Like this:\n```js\ncode\n```»")).toBe("````\n«Like this:\n```js\ncode\n```»\n````");
  });

  test("removes the block the caret is in", () => {
    expect(format("format_code_block", "Intro\n```js\nlet ‸a = 1;\n```\nEnd")).toBe("Intro\nlet ‸a = 1;\nEnd");
  });

  test("removes an unclosed block's opening fence", () => {
    expect(format("format_code_block", "```\ncode‸")).toBe("code‸");
  });
});

describe("links and rules", () => {
  test("selected text goes in the brackets, with the caret in the parentheses", () => {
    expect(format("format_link", "See «the docs» now")).toBe("See [the docs](‸) now");
  });

  test("a selected URL goes in the parentheses, with the caret in the brackets", () => {
    expect(format("format_link", "See «https://example.com» now")).toBe("See [‸](https://example.com) now");
    expect(format("format_link", "«www.example.com»")).toBe("[‸](www.example.com)");
  });

  test("with no selection, inserts an empty link", () => {
    expect(format("format_link", "See ‸")).toBe("See [‸]()");
  });

  test("a rule goes after the caret's line, with a blank line before it", () => {
    expect(format("format_rule", "Some ‸text\nNext")).toBe("Some text\n\n---\n‸\nNext");
  });

  test("a rule on a blank line under text still gets a blank line", () => {
    expect(format("format_rule", "Text\n‸")).toBe("Text\n\n---\n‸");
    expect(format("format_rule", "Text\n\n‸")).toBe("Text\n\n---\n‸");
    expect(format("format_rule", "‸")).toBe("---\n‸");
  });
});

describe("clear styles", () => {
  test("removes inline styles the selection touches", () => {
    expect(format("format_clear", "«**Bold**, *it*, ~~gone~~, ==hi==, `code`»")).toBe("«Bold, it, gone, hi, code»");
  });

  test("a link keeps only its text", () => {
    expect(format("format_clear", "«See [the docs](https://example.com \"Docs\")»")).toBe("«See the docs»");
  });

  test("clears a style the selection only partly covers", () => {
    expect(format("format_clear", "Some **bo«ld** te»xt")).toBe("Some bo«ld te»xt");
  });

  test("with no selection, clears the whole line, markers included", () => {
    expect(format("format_clear", "## A **bold** ‸title\nNext *one*")).toBe("A bold ‸title\nNext *one*");
  });

  test("leaves text outside the selection alone", () => {
    expect(format("format_clear", "**One** «two» **three**")).toBeNull();
  });
});

describe("in the editor", () => {
  test("keeps CRLF line endings", () => {
    const crlf = (id: string, text: string) => format(id, text, "\r\n")?.replaceAll("\n", "⏎");
    // The marked result joins lines with \n (doc.toString()); check the file text too.
    const run = (id: string, text: string, pos: number) => {
      let state = createState(text, () => {}, () => {});
      state = state.update({ selection: EditorSelection.cursor(pos) }).state;
      return documentText({ state: state.update(formatCommands[id](state)!).state });
    };
    // Positions count a CRLF as one character.
    expect(run("format_code_block", "Text\r\n", 5)).toBe("Text\r\n```\r\n\r\n```");
    expect(run("format_rule", "Text\r\nNext", 2)).toBe("Text\r\n\r\n---\r\n\r\nNext");
    expect(run("format_bulleted", "One\r\nTwo", 5)).toBe("One\r\n- Two");
    expect(crlf("format_rule", "Some ‸text\nNext")).toBe("Some text⏎⏎---⏎‸⏎Next");
    expect(crlf("format_code_block", "Intro\n```\nco‸de\n```\nEnd")).toBe("Intro⏎co‸de⏎End");
  });

  test("each command is a single undo step", () => {
    let state = createState("One\nTwo", () => {}, () => {});
    state = state.update({ selection: EditorSelection.single(0, 7) }).state;
    state = state.update(formatCommands.format_bulleted(state)!, { annotations: isolateHistory.of("full") }).state;
    expect(state.doc.toString()).toBe("- One\n- Two");
    let undone = state;
    undo({ state, dispatch: (tr) => (undone = tr.state) });
    expect(undone.doc.toString()).toBe("One\nTwo");
  });

  test("every Format menu item has a command", () => {
    const ids = [1, 2, 3, 4, 5, 6].map((n) => `format_heading_${n}`);
    ids.push("format_bulleted", "format_numbered", "format_task", "format_quote", "format_body");
    ids.push("format_bold", "format_italic", "format_strikethrough", "format_highlight");
    ids.push("format_code", "format_code_block", "format_link", "format_rule", "format_clear");
    ids.push("format_footnote", "format_table", "format_page_break", "format_date");
    expect(Object.keys(formatCommands).sort()).toEqual(ids.sort());
  });
});

describe("Add Footnote", () => {
  test("adds a reference after the selection and a definition at the end", () => {
    expect(format("format_footnote", "A «claim» here.\n")).toBe("A claim[^1] here.\n\n[^1]: ‸");
    expect(format("format_footnote", "Claim‸.")).toBe("Claim[^1].\n\n[^1]: ‸");
  });

  test("numbers after the highest footnote in the document", () => {
    expect(format("format_footnote", "One[^1] and two[^4].\n\n[^1]: a\n[^4]: b\n\nThree‸")).toBe(
      "One[^1] and two[^4].\n\n[^1]: a\n[^4]: b\n\nThree[^5]\n\n[^5]: ‸",
    );
  });

  test("keeps one blank line before the definition however the document ends", () => {
    expect(format("format_footnote", "Text‸\n\n")).toBe("Text[^1]\n\n[^1]: ‸");
    expect(format("format_footnote", "Text‸\n")).toBe("Text[^1]\n\n[^1]: ‸");
    expect(format("format_footnote", "‸")).toBe("[^1]\n\n[^1]: ‸");
  });

  test("keeps CRLF line endings", () => {
    let state = createState("Text\r\n", () => {}, () => {});
    state = state.update({ selection: EditorSelection.cursor(4) }).state;
    state = state.update(formatCommands.format_footnote(state)!).state;
    expect(documentText({ state })).toBe("Text[^1]\r\n\r\n[^1]: ");
  });
});

describe("Add Table", () => {
  const table = "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |";

  test("inserts after the line and selects the first heading", () => {
    expect(format("format_table", "Intro‸")).toBe(`Intro\n\n| «Column 1» | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |`);
  });

  test("fills a blank line and leaves a blank line before the next paragraph", () => {
    expect(format("format_table", "Intro\n\n‸\nAfter")).toBe(
      `Intro\n\n${table.replace("Column 1", "«Column 1»")}\n\nAfter`,
    );
  });

  test("uses the file's line endings", () => {
    let state = createState("Intro\r\nMore", () => {}, () => {});
    state = state.update({ selection: EditorSelection.cursor(5) }).state;
    state = state.update(formatCommands.format_table(state)!).state;
    expect(documentText({ state })).toBe(`Intro\r\n\r\n${table.replaceAll("\n", "\r\n")}\r\n\r\nMore`);
  });
});

describe("Add Page Break", () => {
  test("puts its line in a block of its own", () => {
    expect(format("format_page_break", "End of page‸\nNext page")).toBe("End of page\n\n\\newpage‸\n\nNext page");
  });
});

describe("Add Date", () => {
  const date = new Date(2026, 8, 29);

  test("writes a long date", () => {
    expect(formatDate(date, "en-US")).toBe("September 29, 2026");
    expect(formatDate(date, "de-DE")).toBe("29. September 2026");
  });

  test("replaces the selection, or goes at the caret", () => {
    const state = createState("Today: x", () => {}, () => {}).update({ selection: { anchor: 7, head: 8 } }).state;
    expect(state.update(addDate(state, date, "en-US")).state.doc.toString()).toBe("Today: September 29, 2026");
  });
});
