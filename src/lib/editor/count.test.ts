import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createState } from "./setup";
import { countWords, formatCount, WORDS_PER_MINUTE } from "./count";

const state = (text: string) =>
  EditorState.create({ doc: text, extensions: markdown({ base: markdownLanguage }) });
const count = (text: string) => countWords(state(text));

describe("countWords", () => {
  test.each([
    ["", 0],
    ["   \n\n  ", 0],
    ["One two three", 3],
    ["Don't stop — it's fine.", 4],
    ["Hyphen-ated words", 2],
    ["A well-to-do state-of-the-art plan", 4],
    ["Dashes -- and - spaced - hyphens", 4],
    ["Non\u2011breaking hyphen", 2],
    ["Numbers like 2026 and 3.14 count", 6],
    ["Test Document 2", 3],
    ["Chapter 12, part 3b: 50% of $1,000", 7],
    ["Émigré naïve façade", 3],
    ["Wait... what?! 🙂", 2],
  ])("prose: %j is %i", (text, words) => {
    expect(count(text)).toBe(words);
  });

  test.each([
    ["# Heading", 1],
    ["Setext heading\n===", 2],
    ["- one\n* two\n+ three\n1. four\n2) five", 5],
    ["- [ ] task one\n- [x] task two", 4],
    ["> quoted text\n> > twice", 3],
    ["**bold** *italic* __bold__ _italic_ ~~gone~~", 5],
    ["`inline code` stays", 3],
    ["end. **Next** word", 3],
    // Rendered as "end.Next", which is one word, as in Word and Pages.
    ["end.**Next** word", 2],
    ["un*frigging*believable", 1],
    ["foo**bar** baz", 2],
    ["H<sub>2</sub>O is water", 3],
    ["don\\'t stop", 2],
    ["word![alt](a.png)word", 2],
    ["A [link text](https://example.com/some/long/path \"Its title\") here", 4],
    ["A [reference][ref] link\n\n[ref]: https://example.com", 3],
    ["See https://example.com/a-long-path for more", 3],
    ["An ![alt text here](photo.png) image", 2],
    ["Raw <b>HTML</b> <!-- a comment --> here", 3],
    ["Above\n\n---\n\nBelow", 2],
    ["Escaped \\*stars\\*", 2],
    ["| Name | Age |\n|------|-----|\n| Ann | 30 |", 4],
  ])("syntax: %j is %i", (text, words) => {
    expect(count(text)).toBe(words);
  });

  test("code blocks count their code, not the fence or language", () => {
    expect(count("```javascript\nconst answer = 42;\n```")).toBe(3);
    expect(count("~~~\nplain words\n~~~")).toBe(2);
  });

  test("a selection counts only its ranges", () => {
    const s = state("# Title\n\nOne two three four.");
    const para = s.doc.toString().indexOf("One");
    expect(countWords(s, [{ from: para, to: para + "One two".length }])).toBe(2);
    expect(countWords(s, [{ from: 0, to: 7 }, { from: para, to: para + 3 }])).toBe(2);
    expect(countWords(s, [{ from: 3, to: 3 }])).toBe(0);
  });

  test("a selection starting inside a mark leaves the mark out", () => {
    const s = state("Some **bold** text");
    // From the second "*" to the end.
    expect(countWords(s, [{ from: 6, to: s.doc.length }])).toBe(2);
  });

  test("CRLF files count the same as LF, in the whole document and a selection", () => {
    const text = "# Title\n\nSome **bold** text here.\n\n- [ ] a task\n- [x] done task\n\nA [link](http://x.com) end.";
    // The editor's own state: CRLF files get a "\r\n" line separator.
    const lf = createState(text, () => {}, () => {});
    const crlf = createState(text.replaceAll("\n", "\r\n"), () => {}, () => {});
    expect(countWords(lf)).toBe(12);
    expect(countWords(crlf)).toBe(12);
    const done = crlf.doc.toString().indexOf("- [x]");
    expect(countWords(crlf, [{ from: done, to: crlf.doc.length }])).toBe(5);
  });

  describe("in JavaScriptCore (WKWebView), which says numbers aren't word-like", () => {
    afterEach(() => vi.restoreAllMocks());

    test("numbers are still counted", () => {
      const segment = Intl.Segmenter.prototype.segment;
      vi.spyOn(Intl.Segmenter.prototype, "segment").mockImplementation(function (this: Intl.Segmenter, input) {
        const segments = [...segment.call(this, input)].map((s) => ({
          ...s,
          isWordLike: s.isWordLike && !/^[\d.,]+$/.test(s.segment),
        }));
        return segments as unknown as Intl.Segments;
      });
      expect(count("# Test Document 2\n\n### Lists\n\n1. One\n2. Two\n\nUpdated\n")).toBe(7);
      expect(count("Numbers like 2026 and 3.14 count")).toBe(6);
    });
  });

  test("a long document is counted in full", () => {
    const text = Array.from({ length: 5000 }, (_, i) => `## Part ${i}\n\nSome *words* here.\n`).join("\n");
    expect(count(text)).toBe(5000 * 5);
  });
});

describe("formatCount", () => {
  test.each([
    [0, null, "0 words"],
    [1, null, "1 word · < 1 min"],
    [2, null, "2 words · < 1 min"],
    [WORDS_PER_MINUTE, null, `${WORDS_PER_MINUTE} words · 1 min`],
    [1234, null, "1,234 words · 5 min"],
    [12345, null, "12,345 words · 52 min"],
    [1234, 12, "12 of 1,234 words · < 1 min"],
    [1234, 0, "0 of 1,234 words"],
    [1, 1, "1 of 1 word · < 1 min"],
  ])("%i words, %s selected: %s", (words, selected, text) => {
    expect(formatCount(words, selected)).toBe(text);
  });
});
