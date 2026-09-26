import { invoke } from "@tauri-apps/api/core";

/** Keeps the View → Preview checkmark in step with the frontend's preview state. */
export function setPreviewChecked(checked: boolean): Promise<void> {
  return invoke("set_preview_checked", { checked });
}
