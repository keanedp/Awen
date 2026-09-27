import { describe, expect, test } from "vitest";
import { breakRule, tableEms } from "./fit-tables";

describe("a table's width in ems", () => {
  test("is its width over its font size, plus room for the borders", () => {
    expect(tableEms(500, 10)).toBe(50.1);
  });

  test("rounds up, so the table never comes out wider than the page", () => {
    expect(tableEms(501, 12)).toBe(41.85); // 41.75 + 0.1
    expect(tableEms(100, 3)).toBe(33.44); // 33.333… + 0.1
  });

  test("doesn't depend on the size it was measured at", () => {
    expect(tableEms(480, 16)).toBe(tableEms(240, 8));
  });
});

describe("links in a table break only when it can't fit otherwise", () => {
  test("they break on pages narrower than the table at its smallest (6pt)", () => {
    // 80em at 6pt is 480pt, so an A4 page (467pt between margins) breaks them and Letter (484pt) doesn't.
    expect(breakRule(0, 80)).toContain("@container (width < 480pt)");
  });

  test("the width rounds up, so a table exactly at the limit still breaks them", () => {
    expect(breakRule(0, 52.73)).toContain("(width < 317pt)"); // 316.38pt
  });

  test("the rule applies to that table's links and code only", () => {
    expect(breakRule(3, 50)).toContain('.paper table[data-fit="3"] :is(a, code) { overflow-wrap: anywhere; }');
  });
});
