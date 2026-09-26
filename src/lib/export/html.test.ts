import { beforeAll, describe, expect, test, vi } from "vitest";
import { exportHtml, fontNotice } from "./html";

// The real ones need the webview; these hand back a stand-in font file.
beforeAll(() => {
  vi.stubGlobal("fetch", async () => new Response("font"));
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:font/woff2;base64,Zm9udA==";
      onload: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
});

describe("the embedded fonts carry their licence", () => {
  test("the notice comes before the first @font-face", async () => {
    const html = await exportHtml("# Title", "Title");
    const notice = html.indexOf(fontNotice);
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(html.indexOf("@font-face"));
  });

  test("the notice names both copyright holders and the licence", () => {
    expect(fontNotice).toContain("Information Architects Inc.");
    expect(fontNotice).toContain("IBM Corp.");
    expect(fontNotice).toContain("SIL Open Font License 1.1");
  });
});
