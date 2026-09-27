/**
 * Print and PDF can't scroll, so a table wider than the page shrinks its text
 * to fit instead of being cut off at the edge (the sizes are in preview.css).
 *
 * The page width isn't known until the print layout, so this measures each
 * table's widths in its own ems and leaves the comparison to CSS, against the
 * print copy's width (`100cqi`, `@container`).
 */

/** The smallest table text, as in preview.css. */
const floorPt = 6;

/**
 * A width in ems, rounded up. Borders are fixed pixels, not ems, so a small
 * allowance keeps the scaled-down table from overflowing by one.
 */
export function tableEms(widthPx: number, fontSizePx: number): number {
  const slack = 0.1;
  return Math.ceil((widthPx / fontSizePx + slack) * 100) / 100;
}

/**
 * Links and code stay whole, since letting them break anywhere makes the table
 * layout split addresses that would have fit. But a table that is still wider
 * than the page at the smallest size would push past the margin, and the print
 * then shrinks the whole document, so that table's links and code may break.
 */
export function breakRule(index: number, minEms: number): string {
  const widthPt = Math.ceil(minEms * floorPt);
  return `@container (width < ${widthPt}pt) { .paper table[data-fit="${index}"] :is(a, code) { overflow-wrap: anywhere; } }`;
}

/**
 * Sets two widths on every table in the print copy:
 * `--table-ems`, with every cell on one line, and
 * `--table-min-ems`, the narrowest it gets without breaking a word.
 * The copy is hidden on screen, so each table is laid out in an offscreen
 * probe that carries the same classes.
 */
export function fitTables(article: HTMLElement): void {
  const rules: string[] = [];
  const tables = article.querySelectorAll("table");
  const probe = article.cloneNode(false) as HTMLElement;
  probe.style.cssText = "position: fixed; left: -100000px; top: 0; visibility: hidden; max-width: none;";
  document.body.append(probe);
  tables.forEach((table, index) => {
    const copy = table.cloneNode(true) as HTMLTableElement;
    probe.replaceChildren(copy);
    const fontSize = parseFloat(getComputedStyle(copy).fontSize);
    const ems = (width: string) => {
      probe.style.width = width;
      return tableEms(copy.getBoundingClientRect().width, fontSize);
    };
    const minEms = ems("min-content");
    table.style.setProperty("--table-ems", String(ems("max-content")));
    table.style.setProperty("--table-min-ems", String(minEms));
    table.dataset.fit = String(index);
    rules.push(breakRule(index, minEms));
  });
  probe.remove();
  breakStyle().textContent = rules.join("\n");
}

function breakStyle(): HTMLStyleElement {
  let style = document.getElementById("fit-tables") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "fit-tables";
    document.head.append(style);
  }
  return style;
}
