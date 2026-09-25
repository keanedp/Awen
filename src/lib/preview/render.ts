import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

// Raw HTML stays off: the preview runs in a webview with access to Tauri IPC,
// so a document must never be able to inject scripts or elements.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true }).use(taskLists);

/** Tag each rendered block with its source line so editor and preview positions can be matched. */
md.core.ruler.push("source_lines", (state) => {
  if (!state.env.sourceLines) return;
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1 && token.block) {
      token.attrSet("data-line", String(token.map[0]));
    }
  }
});

/**
 * Renders Markdown to HTML. `sourceLines` adds `data-line` attributes for the
 * in-app preview; exports leave them out.
 */
export function renderMarkdown(text: string, { sourceLines = false } = {}): string {
  return md.render(text, { sourceLines });
}
