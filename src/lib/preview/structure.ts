import type { MarkdownIt, RendererRule, StateBlock } from "markdown-it";

/** A line on its own that starts a new printed page (W-061), as in Pandoc. */
const pageBreakLine = /^\\(?:newpage|pagebreak)$/;

/** A block rule for a line holding just a page break, which becomes a `page_break` token. */
function pageBreakRule(state: StateBlock, start: number, _end: number, silent: boolean) {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
  if (!pageBreakLine.test(line)) return false;
  if (!silent) {
    const token = state.push("page_break", "", 0);
    token.map = [start, start + 1];
    token.block = true;
  }
  state.line = start + 1;
  return true;
}

/**
 * Page breaks for the Format menu (W-061): `\newpage` on its own line, honored
 * in print and PDF.
 */
const structure = (md: MarkdownIt) => {
  md.block.ruler.before("paragraph", "page_break", pageBreakRule);
  // The preview's core rule (render.ts) gives these tokens their data-line attribute.
  const pageBreak: RendererRule = (tokens, idx, _options, _env, self) =>
    `<div class="page-break"${self.renderAttrs(tokens[idx])}></div>\n`;
  md.renderer.rules.page_break = pageBreak;
};

export default structure;
