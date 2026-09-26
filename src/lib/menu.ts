import { invoke } from "@tauri-apps/api/core";

/** Keeps a menu checkmark (View → Preview, Word Count, Code Highlighting) in step with the frontend. */
export function setMenuChecked(id: "preview" | "word_count" | "code_highlighting", checked: boolean): Promise<void> {
  return invoke("set_menu_checked", { id, checked });
}

/** Enables the Format menu (W-060) while the focused window's document can be edited. */
export function setFormatEnabled(enabled: boolean): Promise<void> {
  return invoke("set_format_enabled", { enabled });
}

/** Puts a document at the top of File → Open Recent. */
export function noteRecentDocument(path: string): Promise<void> {
  return invoke("note_recent_document", { path });
}
