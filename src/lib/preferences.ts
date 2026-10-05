import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ExportFormat } from "./files";
import {
  columnWidths,
  defaultTextSize,
  focusUnits,
  isTextSize,
  lineSpacings,
  themes,
  writingFonts,
  type ColumnWidth,
  type FocusUnit,
  type LineSpacing,
  type Theme,
  type WritingFont,
} from "./settings";

/**
 * App-wide preferences, shared by every window and kept between launches.
 * Rust stores them in `preferences.json` (`src-tauri/src/preferences.rs`);
 * names, types and defaults live here. To add one, add it to `Preferences`,
 * `defaults` and `valid`.
 */
export interface Preferences {
  /** View → Word Count: the footer with words and reading time. */
  wordCount: boolean;
  /** View → Code Highlighting: muted colors in the editor's fenced code blocks. */
  codeHighlighting: boolean;
  /** Find options, shared by every document window. */
  findMatchCase: boolean;
  findWholeWord: boolean;
  /** View → Focus Mode: dims all but the sentence or paragraph being written. */
  focusMode: boolean;
  /** View → Focus On: what focus mode keeps undimmed. */
  focusUnit: FocusUnit;
  /** The format the export dialog starts with: the last one used. */
  exportFormat: ExportFormat;
  /** Settings → Font: the editor's; preview, print and exports keep the system font. */
  writingFont: WritingFont;
  /** Settings → Text size, in CSS pixels; also View → Bigger / Smaller / Actual Size. */
  textSize: number;
  /** Settings → Column width. */
  columnWidth: ColumnWidth;
  /** Settings → Line spacing. */
  lineSpacing: LineSpacing;
  /** Settings → Check spelling while typing. */
  spellcheck: boolean;
  /** Settings → Appearance. Rust applies it to the app (`preferences::apply_theme`). */
  theme: Theme;
  /** Settings → Automatically check for updates, at launch. Rust reads it (`updates::check_at_launch`). */
  checkForUpdates: boolean;
}

export const defaults: Preferences = {
  wordCount: true,
  codeHighlighting: false,
  findMatchCase: false,
  findWholeWord: false,
  focusMode: false,
  focusUnit: "sentence",
  exportFormat: "html",
  writingFont: "neon",
  textSize: defaultTextSize,
  columnWidth: "medium",
  lineSpacing: "normal",
  spellcheck: true,
  theme: "system",
  checkForUpdates: true,
};

/** A check that a value is one of `choices`. */
const oneOf =
  <T extends string>(choices: readonly T[]) =>
  (value: unknown): value is T =>
    choices.includes(value as T);

/** Checks a saved value, which may come from an older or newer version, or a hand-edited file. */
const valid: { [K in keyof Preferences]: (value: unknown) => value is Preferences[K] } = {
  wordCount: (value) => typeof value === "boolean",
  codeHighlighting: (value) => typeof value === "boolean",
  findMatchCase: (value) => typeof value === "boolean",
  findWholeWord: (value) => typeof value === "boolean",
  focusMode: (value) => typeof value === "boolean",
  focusUnit: oneOf(focusUnits),
  exportFormat: (value) => value === "html" || value === "pdf",
  writingFont: oneOf(Object.keys(writingFonts) as WritingFont[]),
  textSize: isTextSize,
  columnWidth: oneOf(Object.keys(columnWidths) as ColumnWidth[]),
  lineSpacing: oneOf(Object.keys(lineSpacings) as LineSpacing[]),
  spellcheck: (value) => typeof value === "boolean",
  theme: oneOf(themes),
  checkForUpdates: (value) => typeof value === "boolean",
};

function isKey(key: string): key is keyof Preferences {
  return Object.hasOwn(valid, key);
}

/** The saved preferences, with defaults for any that are missing or invalid. */
export function parsePreferences(saved: Record<string, unknown>): Preferences {
  const prefs = { ...defaults };
  for (const [key, value] of Object.entries(saved)) {
    if (isKey(key) && valid[key](value)) Object.assign(prefs, { [key]: value });
  }
  return prefs;
}

export async function loadPreferences(): Promise<Preferences> {
  return parsePreferences(await invoke<Record<string, unknown>>("preferences"));
}

/** Saves a preference; every window, this one included, then gets `onPreferenceChanged`. */
export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
  return invoke("set_preference", { key, value });
}

/** Saves several preferences, as `setPreference` does. */
export function setPreferences(change: Partial<Preferences>): Promise<unknown> {
  return Promise.all(Object.entries(change).map(([key, value]) => invoke("set_preference", { key, value })));
}

/** Calls `apply` when any window changes a preference. */
export function onPreferenceChanged(apply: (change: Partial<Preferences>) => void): Promise<UnlistenFn> {
  return listen<{ key: string; value: unknown }>("preference-changed", ({ payload: { key, value } }) => {
    if (isKey(key) && valid[key](value)) apply({ [key]: value });
  });
}
