import type { Preferences } from "./preferences";

/**
 * The choices the settings window offers for the writing column (W-021), and
 * how they become the CSS tokens the editor and preview are styled with.
 */

/** Text sizes in CSS pixels: the slider's stops, and the steps of View → Bigger / Smaller. */
export const textSizes = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28];
export const defaultTextSize = 18;

/** Column widths in characters. */
export const columnWidths = { narrow: 58, medium: 66, wide: 80 };
export type ColumnWidth = keyof typeof columnWidths;

/** Line heights, as multiples of the text size. */
export const lineSpacings = { tight: 1.4, normal: 1.6, loose: 1.8 };
export type LineSpacing = keyof typeof lineSpacings;

/** Writing fonts, as font stacks. The Monaspace faces are bundled; see `app.css`. */
export const writingFonts = {
  neon: `"Monaspace Neon", ui-monospace, monospace`,
  argon: `"Monaspace Argon", ui-monospace, monospace`,
  radon: `"Monaspace Radon", ui-monospace, monospace`,
  // WebView2 has no `ui-monospace`, so Windows gets Cascadia Mono, or Consolas before Windows 11.
  system: `ui-monospace, "SF Mono", Menlo, "Cascadia Mono", Consolas, monospace`,
};
export type WritingFont = keyof typeof writingFonts;

/** What focus mode (W-017) keeps undimmed. */
export const focusUnits = ["sentence", "paragraph"] as const;
export type FocusUnit = (typeof focusUnits)[number];

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

/** Any size in the slider's range; a hand-edited 19 is kept, and steps to the nearest stop. */
export function isTextSize(value: unknown): value is number {
  return typeof value === "number" && value >= textSizes[0] && value <= textSizes[textSizes.length - 1];
}

/** View → Bigger: the next size up, if there is one. */
export function biggerText(size: number): number {
  return textSizes.find((s) => s > size) ?? size;
}

/** View → Smaller: the next size down, if there is one. */
export function smallerText(size: number): number {
  return textSizes.findLast((s) => s < size) ?? size;
}

/**
 * The writing tokens for these preferences, as an inline style. Set on the
 * app, not `:root`, so print and PDF keep `preview.css`'s paper typography.
 */
export function writingStyle(
  prefs: Pick<Preferences, "writingFont" | "textSize" | "columnWidth" | "lineSpacing">,
): string {
  return [
    `--font-writing: ${writingFonts[prefs.writingFont]}`,
    `--writing-size: ${prefs.textSize}px`,
    `--writing-line-height: ${lineSpacings[prefs.lineSpacing]}`,
    `--measure: ${columnWidths[prefs.columnWidth]}ch`,
  ].join("; ");
}

/** What focus mode keeps undimmed, or `null` when it's off. */
export function activeFocusUnit(prefs: Pick<Preferences, "focusMode" | "focusUnit">): FocusUnit | null {
  return prefs.focusMode ? prefs.focusUnit : null;
}

/**
 * What a View menu command changes, if it sets a preference. Document windows
 * and Settings both handle these, since the menu goes to whichever is focused.
 */
export function viewChange(id: string, prefs: Preferences): Partial<Preferences> | null {
  switch (id) {
    case "word_count":
      return { wordCount: !prefs.wordCount };
    case "code_highlighting":
      return { codeHighlighting: !prefs.codeHighlighting };
    case "focus_mode":
      return { focusMode: !prefs.focusMode };
    // Choosing what to focus on also turns focus mode on, so the choice shows.
    case "focus_sentence":
      return { focusMode: true, focusUnit: "sentence" };
    case "focus_paragraph":
      return { focusMode: true, focusUnit: "paragraph" };
    case "text_bigger":
      return { textSize: biggerText(prefs.textSize) };
    case "text_smaller":
      return { textSize: smallerText(prefs.textSize) };
    case "text_actual":
      return { textSize: defaultTextSize };
  }
  return null;
}
