import { describe, expect, test } from "vitest";
import { exportHtml } from "./html";

describe("the export is set in the reader's system font", () => {
  test("no fonts are embedded", async () => {
    const html = await exportHtml("# Title", "Title");
    expect(html).not.toContain("@font-face");
    expect(html).not.toContain("data:font");
  });

  test("the preview font falls back from macOS to Windows to a generic sans-serif", async () => {
    const html = await exportHtml("# Title", "Title");
    const stack = html.match(/--font-preview:([^;]+);/)?.[1] ?? "";
    const families = stack.split(",").map((f) => f.trim());
    expect(families[0]).toBe("-apple-system");
    expect(families).toContain('"Segoe UI"');
    expect(families).toContain("sans-serif");
    expect(families.indexOf("-apple-system")).toBeLessThan(families.indexOf('"Segoe UI"'));
  });
});
