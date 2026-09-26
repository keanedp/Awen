import { beforeAll, describe, expect, test, vi } from "vitest";
import { loadCodeLanguages } from "./highlight";
import { localImage, renderMarkdown } from "./render";

// The real one needs the Tauri webview; this shows which file would be read.
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => `asset://${path}` }));

describe("raw HTML is shown as text, never run", () => {
  const attacks = [
    "<script>alert(1)</script>",
    '<img src="x" onerror="alert(1)">',
    '<iframe src="https://example.com"></iframe>',
    "<div onclick=\"alert(1)\">text</div>",
    "Inline <b onmouseover=\"alert(1)\">bold</b>",
    "<!-- comment --><style>body{display:none}</style>",
  ];

  test.each(attacks)("%s", (source) => {
    for (const preview of [true, false]) {
      const html = renderMarkdown(source, { preview, folder: "/docs" });
      expect(html).not.toMatch(/<(script|img|iframe|div|b|style)\b/);
      expect(html).toContain("&lt;");
    }
  });

  test.each([
    "[click](javascript:alert(1))",
    "[click](JAVASCRIPT:alert(1))",
    "[click](vbscript:msgbox(1))",
    "[click](data:text/html;base64,PHNjcmlwdD4=)",
    "![x](javascript:alert(1))",
  ])("%s is not linked", (source) => {
    expect(renderMarkdown(source, { preview: true })).not.toMatch(/(href|src)="(javascript|vbscript|data:text)/i);
  });

  test("attribute values are escaped", () => {
    const html = renderMarkdown('[a](https://example.com/"onmouseover="alert(1)) ![b" onerror="x](p.png)');
    expect(html).not.toMatch(/"\s*on(mouseover|error)=/);
  });
});

describe("code blocks", () => {
  beforeAll(() => loadCodeLanguages("```js\n```\n"));

  test("highlighted code is escaped", () => {
    const html = renderMarkdown('```js\nconst s = "</code><script>alert(1)</script>" && a < b;\n```');
    expect(html).toContain('<span class="hl-keyword">const</span>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;/code&gt;&lt;script&gt;");
    expect(html).toContain("a &lt; b");
  });

  test("an unknown or missing language is plain, escaped code", () => {
    for (const fence of ["```nosuchlanguage", "```"]) {
      const html = renderMarkdown(`${fence}\n<b>&</b>\n\`\`\``);
      expect(html).not.toContain("hl-");
      expect(html).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    }
  });

  test("the language class can't break out of its attribute", () => {
    const html = renderMarkdown('```"><script>\ncode\n```');
    expect(html).not.toContain("<script>");
  });
});

describe("localImage", () => {
  test.each([
    ["photo.png", "/docs/photo.png"],
    ["./photo.png", "/docs/photo.png"],
    ["img/photo.png", "/docs/img/photo.png"],
    ["img/../photo.png", "/docs/photo.png"],
    ["../photo.png", "/photo.png"],
    ["My%20Photo.png", "/docs/My Photo.png"],
    ["photo.png?v=2", "/docs/photo.png"],
    ["photo.png#part", "/docs/photo.png"],
    ["/elsewhere/photo.png", "/elsewhere/photo.png"],
  ])("%s beside /docs/Notes.md", (src, file) => {
    expect(localImage(src, "/docs")).toBe(`asset://${file}`);
  });

  test.each([
    ["photo.png", "C:/Users/me/docs/photo.png"],
    ["img\\photo.png", "C:/Users/me/docs/img/photo.png"],
    ["..\\photo.png", "C:/Users/me/photo.png"],
    ["D:\\pictures\\photo.png", "D:/pictures/photo.png"],
    ["d:/pictures/photo.png", "d:/pictures/photo.png"],
  ])("Windows: %s beside C:\\Users\\me\\docs\\Notes.md", (src, file) => {
    expect(localImage(src, "C:\\Users\\me\\docs")).toBe(`asset://${file}`);
  });

  test.each([
    "https://example.com/photo.png",
    "HTTP://example.com/photo.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "//cdn.example.com/photo.png",
    "#anchor",
    "mailto:me@example.com",
  ])("leaves %s alone", (src) => {
    expect(localImage(src, "/docs")).toBeNull();
  });

  test("a malformed escape is left alone", () => {
    expect(localImage("100%.png", "/docs")).toBeNull();
  });

  test("renders into the preview, but exports keep the relative path", () => {
    expect(renderMarkdown("![alt](photo.png)", { preview: true, folder: "/docs" })).toContain(
      'src="asset:///docs/photo.png"',
    );
    expect(renderMarkdown("![alt](photo.png)")).toContain('src="photo.png"');
  });
});
