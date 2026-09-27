import previewCss from "../../styles/preview.css?raw";
import { loadCodeLanguages } from "$lib/preview/highlight";
import { renderMarkdown } from "$lib/preview/render";

// The exported page carries its own colour tokens so it looks the same in any browser.
// It is set in the reader's system font: nothing is embedded, since SF and Segoe UI can't be redistributed.
const pageCss = `
:root {
  --font-preview: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --writing-size: 18px;
  --writing-line-height: 1.6;
  --measure: 66ch;
  --surface: #ffffff;
  --text: #1a1a1a;
  --text-muted: #8a8a8a;
  --markup: #c8c8c8;
  --accent: #0a6fd8;
  --selection: rgb(0 122 255 / 0.2);
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #1a1a1a;
    --text: #d4d4d4;
    --text-muted: #7a7a7a;
    --markup: #4a4a4a;
    --accent: #4aa3ff;
  }
}
body {
  margin: 0;
  background: var(--surface);
  -webkit-text-size-adjust: 100%;
}
.preview {
  padding-bottom: 4rem;
}
`;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** A standalone HTML document for the given Markdown. */
export async function exportHtml(markdown: string, title: string): Promise<string> {
  await loadCodeLanguages(markdown);
  const body = renderMarkdown(markdown);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Awen">
<title>${escapeHtml(title)}</title>
<style>
${pageCss}
${previewCss}
</style>
</head>
<body>
<article class="preview">
${body}</article>
</body>
</html>
`;
}
