import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightCode, tagHighlighter, tags as t } from "@lezer/highlight";

/**
 * Syntax highlighting for fenced code blocks in preview, print and exports,
 * and (muted, W-045) in the editor. Both use these Lezer parsers and classes,
 * so they match. A small palette keeps code calm next to the prose; the
 * colours are `--code-*` tokens in preview.css.
 */
export const codeHighlighter = tagHighlighter([
  { tag: t.keyword, class: "hl-keyword" },
  { tag: [t.string, t.regexp, t.escape], class: "hl-string" },
  { tag: [t.literal, t.atom], class: "hl-literal" },
  { tag: [t.comment, t.meta, t.processingInstruction], class: "hl-comment" },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], class: "hl-type" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], class: "hl-function" },
  { tag: [t.attributeName, t.propertyName, t.labelName], class: "hl-property" },
  { tag: t.inserted, class: "hl-inserted" },
  { tag: t.deleted, class: "hl-deleted" },
  { tag: t.heading, class: "hl-heading" },
  { tag: t.invalid, class: "hl-invalid" },
]);

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

/**
 * The language a fence's info string names, by name, alias or file extension
 * (`py`, `rs`). Attributes after the name (`js{1,3}`) are ignored.
 */
export function codeLanguage(info: string): LanguageDescription | null {
  const name = /^[^\s`{]*/.exec(info)![0];
  if (!name) return null;
  return (
    LanguageDescription.matchLanguageName(languages, name, false) ??
    LanguageDescription.matchFilename(languages, `file.${name}`)
  );
}

/**
 * Loads the parsers for the languages named by the document's fenced code
 * blocks. markdown-it renders synchronously, so await this before rendering;
 * parsers are code-split and cached after the first load.
 */
export async function loadCodeLanguages(markdown: string): Promise<void> {
  const loads = new Set<Promise<unknown>>();
  for (const [, info] of markdown.matchAll(/^[ \t>]*(?:`{3,}|~{3,})[ \t]*([^\s`{]+)/gm)) {
    const language = codeLanguage(info);
    if (language && !language.support) loads.add(language.load().catch(() => {}));
  }
  await Promise.all(loads);
}

/**
 * Highlighted HTML (escaped text in `<span class="hl-…">`) for `code` in the
 * language named `name`, or "" to let markdown-it escape it as plain code.
 */
export function highlight(code: string, name: string): string {
  const support = codeLanguage(name)?.support;
  if (!support) return "";
  let html = "";
  highlightCode(
    code,
    support.language.parser.parse(code),
    codeHighlighter,
    (text, classes) => {
      html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
    },
    () => (html += "\n"),
  );
  return html;
}
