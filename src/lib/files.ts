import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const filters = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

export function readDocument(path: string): Promise<string> {
  return invoke<string>("read_document", { path });
}

export function writeDocument(path: string, contents: string): Promise<void> {
  return invoke("write_document", { path, contents });
}

export async function pickFileToOpen(): Promise<string | null> {
  const path = await open({ multiple: false, directory: false, filters });
  return typeof path === "string" ? path : null;
}

export function pickSaveLocation(suggestedName: string): Promise<string | null> {
  return save({ defaultPath: suggestedName, filters });
}

export function fileName(path: string | null): string {
  if (!path) return "Untitled";
  return path.split(/[\\/]/).pop() ?? path;
}
