import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";

// Raw HTML stays off: the preview runs in a webview with access to Tauri IPC,
// so a document must never be able to inject scripts or elements.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true }).use(taskLists);

/**
 * In the in-app preview: tag each rendered block with its source line, so editor
 * and preview positions can be matched and a clicked task checkbox can find its
 * line; and make task checkboxes clickable (the plugin renders them disabled).
 */
md.core.ruler.push("preview", (state) => {
  if (!state.env.preview) return;
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1 && token.block) {
      token.attrSet("data-line", String(token.map[0]));
    }
    for (const child of token.children ?? []) {
      const checkbox = child.content.startsWith('<input class="task-list-item-checkbox"');
      if (child.type === "html_inline" && checkbox) {
        child.content = child.content.replace(' disabled="" ', " ");
      }
    }
  }
});

/**
 * Renders Markdown to HTML. `preview` adds `data-line` attributes and clickable
 * task checkboxes for the in-app preview; exports leave them out.
 */
export function renderMarkdown(text: string, { preview = false } = {}): string {
  return md.render(text, { preview });
}
