import { invoke } from "@tauri-apps/api/core";
import type { Preferences } from "./preferences";

/** Keeps a menu checkmark (View → Preview, Focus Mode, Word Count, …) in step with the frontend. */
export function setMenuChecked(
  id:
    | "preview"
    | "focus_mode"
    | "focus_sentence"
    | "focus_paragraph"
    | "focus_typewriter"
    | "word_count"
    | "code_highlighting",
  checked: boolean,
): Promise<void> {
  return invoke("set_menu_checked", { id, checked });
}

/** Restates View → Focus Mode and the Focus On unit's checkmark. */
export function setFocusChecked({ focusMode, focusUnit }: Pick<Preferences, "focusMode" | "focusUnit">) {
  setMenuChecked("focus_mode", focusMode);
  setMenuChecked("focus_sentence", focusUnit === "sentence");
  setMenuChecked("focus_paragraph", focusUnit === "paragraph");
  setMenuChecked("focus_typewriter", focusUnit === "typewriter");
}

/** Enables the Format menu (W-060) while the focused window's document can be edited. */
export function setFormatEnabled(enabled: boolean): Promise<void> {
  return invoke("set_format_enabled", { enabled });
}

/** Puts a document at the top of File → Open Recent. */
export function noteRecentDocument(path: string): Promise<void> {
  return invoke("note_recent_document", { path });
}

/** A Windows menu title's box in the web view (`getBoundingClientRect()`), for `trackMenuBar`. */
export type MenuTitleBox = { name: string; left: number; top: number; right: number; bottom: number };

/**
 * Opens the menu at `open` under its title and lets the pointer and arrow keys
 * move between menus until one closes (Windows, W-073). Resolves to the
 * index of the title to keep highlighted when Esc closed the menu, else null.
 */
export function trackMenuBar(titles: MenuTitleBox[], open: number): Promise<number | null> {
  return invoke("track_menu_bar", { titles, open });
}
