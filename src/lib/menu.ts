import { invoke } from "@tauri-apps/api/core";

/** Keeps a menu checkmark (View → Preview, Word Count, Code Highlighting) in step with the frontend. */
export function setMenuChecked(id: "preview" | "word_count" | "code_highlighting", checked: boolean): Promise<void> {
  return invoke("set_menu_checked", { id, checked });
}

/** Puts a document at the top of File → Open Recent. */
export function noteRecentDocument(path: string): Promise<void> {
  return invoke("note_recent_document", { path });
}
