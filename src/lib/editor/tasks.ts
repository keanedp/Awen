import type { ChangeSpec, Text } from "@codemirror/state";

/**
 * The change that ticks or unticks the task list item on 0-based source `line`,
 * or null if that line isn't one.
 */
export function taskToggle(doc: Text, line: number): ChangeSpec | null {
  if (line < 0 || line >= doc.lines) return null;
  const { from, text } = doc.line(line + 1);
  // Optional blockquote marks, a list marker, then the box.
  const match = /^(?:\s*>)*\s*(?:[-*+]|\d{1,9}[.)])\s+\[([ xX])\]/.exec(text);
  if (!match) return null;
  const at = from + match[0].length - 2;
  return { from: at, to: at + 1, insert: match[1] === " " ? "x" : " " };
}
