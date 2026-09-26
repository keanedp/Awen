import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ExportFormat } from "./files";

/**
 * App-wide preferences, shared by every window and kept between launches.
 * Rust stores them in `preferences.json` (`src-tauri/src/preferences.rs`);
 * names, types and defaults live here. To add one, add it to `Preferences`,
 * `defaults` and `valid`.
 */
export interface Preferences {
  /** View → Word Count: the footer with words and reading time. */
  wordCount: boolean;
  /** The format the export dialog starts with: the last one used. */
  exportFormat: ExportFormat;
}

export const defaults: Preferences = {
  wordCount: true,
  exportFormat: "html",
};

/** Checks a saved value, which may come from an older or newer version, or a hand-edited file. */
const valid: { [K in keyof Preferences]: (value: unknown) => value is Preferences[K] } = {
  wordCount: (value) => typeof value === "boolean",
  exportFormat: (value) => value === "html" || value === "pdf",
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

/** Calls `apply` when any window changes a preference. */
export function onPreferenceChanged(apply: (change: Partial<Preferences>) => void): Promise<UnlistenFn> {
  return listen<{ key: string; value: unknown }>("preference-changed", ({ payload: { key, value } }) => {
    if (isKey(key) && valid[key](value)) apply({ [key]: value });
  });
}
