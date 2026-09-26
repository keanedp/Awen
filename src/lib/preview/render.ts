import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import { convertFileSrc } from "@tauri-apps/api/core";
import { highlight } from "./highlight";

// Raw HTML stays off: the preview runs in a webview with access to Tauri IPC,
// so a document must never be able to inject scripts or elements. The code
// highlighter escapes its output too.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true, highlight }).use(taskLists);

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
 * The asset URL for image `src` relative to `folder`, or null to leave `src`
 * alone (URLs with a scheme, protocol-relative URLs, fragments). Rust lets the
 * asset protocol read only the folders of opened documents.
 */
function localImage(src: string, folder: string): string | null {
  const drive = /^[a-z]:[\\/]/i.test(src);
  if (!drive && (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//") || src.startsWith("#"))) return null;
  let file: string;
  try {
    // markdown-it percent-encodes the source; the file system wants the real name.
    file = decodeURI(src.replace(/[?#].*$/, ""));
  } catch {
    return null;
  }
  const absolute = drive || file.startsWith("/");
  const parts: string[] = [];
  for (const part of (absolute ? file : `${folder}/${file}`).split(/[\\/]/)) {
    if (part === "..") parts.pop();
    else if (part !== "." && (part !== "" || parts.length === 0)) parts.push(part);
  }
  return convertFileSrc(parts.join("/"));
}

const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = token.attrGet("src");
  const folder = env?.folder as string | null | undefined;
  const url = folder && src ? localImage(String(src), folder) : null;
  if (url) token.attrSet("src", url);
  return defaultImage(tokens, idx, options, env, self);
};

/**
 * Renders Markdown to HTML. `preview` adds `data-line` attributes and clickable
 * task checkboxes for the in-app preview; exports leave them out. `folder` (the
 * document's folder) makes relative image paths load in this webview, for the
 * preview, print and PDF; HTML export leaves them relative to where it's saved.
 * Code blocks are highlighted only in languages already loaded: await
 * `loadCodeLanguages(text)` first.
 */
export function renderMarkdown(
  text: string,
  { preview = false, folder = null as string | null } = {},
): string {
  return md.render(text, { preview, folder });
}
