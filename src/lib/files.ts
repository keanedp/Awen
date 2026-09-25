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

export function pickExportLocation(suggestedName: string): Promise<string | null> {
  return save({ defaultPath: suggestedName, filters: [{ name: "HTML", extensions: ["html"] }] });
}

/** Prints the current page through the system print dialog (which also offers PDF). */
export function printPage(): Promise<void> {
  return invoke("print_page");
}

export function fileName(path: string | null): string {
  if (!path) return "Untitled";
  return path.split(/[\\/]/).pop() ?? path;
}

/** The file name without its extension, e.g. "Notes.md" → "Notes". */
export function baseName(path: string | null): string {
  return fileName(path).replace(/\.[^.]+$/, "");
}
