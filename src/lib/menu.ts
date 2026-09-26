import { invoke } from "@tauri-apps/api/core";

/** Keeps the View → Preview checkmark in step with the frontend's preview state. */
export function setPreviewChecked(checked: boolean): Promise<void> {
  return invoke("set_preview_checked", { checked });
}

/** Puts a document at the top of File → Open Recent. */
export function noteRecentDocument(path: string): Promise<void> {
  return invoke("note_recent_document", { path });
}

/** Removes a document from File → Open Recent. */
export function forgetRecentDocument(path: string): Promise<void> {
  return invoke("forget_recent_document", { path });
}
