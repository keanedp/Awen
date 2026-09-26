import previewCss from "../../styles/preview.css?raw";
import { loadCodeLanguages } from "$lib/preview/highlight";
import { renderMarkdown } from "$lib/preview/render";

const fonts = [
  { file: "ClassicMono-Regular.woff2", weight: 400, style: "normal" },
  { file: "ClassicMono-Italic.woff2", weight: 400, style: "italic" },
  { file: "ClassicMono-Bold.woff2", weight: 700, style: "normal" },
  { file: "ClassicMono-BoldItalic.woff2", weight: 700, style: "italic" },
];

// The exported page carries its own colour tokens so it looks the same in any browser.
const pageCss = `
:root {
  --font-writing: "Classic Mono", ui-monospace, monospace;
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

async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let fontCss: Promise<string> | undefined;

/** @font-face rules with the fonts embedded, so the export is a single file. */
function embeddedFonts(): Promise<string> {
  fontCss ??= Promise.all(
    fonts.map(async ({ file, weight, style }) => {
      const src = await toDataUrl(`/fonts/${file}`);
      return `@font-face { font-family: "Classic Mono"; src: url("${src}") format("woff2"); font-weight: ${weight}; font-style: ${style}; }`;
    }),
  ).then((rules) => rules.join("\n"));
  return fontCss;
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
<meta name="generator" content="Writer">
<title>${escapeHtml(title)}</title>
<style>
${await embeddedFonts()}
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
