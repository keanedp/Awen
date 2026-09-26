import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { detectOS } from "./platform";

const filters = [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }];

/**
 * Opens a document: brings forward the window already showing it, or opens a
 * new window. If `reuse` (this window is an untouched untitled document), the
 * text is returned for this window to show instead.
 */
export function openDocument(path: string, reuse: boolean): Promise<string | null> {
  return invoke<string | null>("open_document", { path, reuse });
}

/** The document Rust opened this window for, if any. */
export function takeInitialDocument(): Promise<{ path: string; text: string } | null> {
  return invoke("take_initial_document");
}

/** Tells Rust which file this window now shows (after Save As). */
export function setDocumentPath(path: string): Promise<void> {
  return invoke("set_document_path", { path });
}

/** This window kept its unsaved changes, so an ongoing Quit stops. */
export function cancelQuit(): Promise<void> {
  return invoke("cancel_quit");
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

export type ExportFormat = "html" | "pdf";

export interface ExportTarget {
  path: string;
  format: ExportFormat;
}

const exportFilters = {
  html: { name: "HTML", extensions: ["html"] },
  pdf: { name: "PDF", extensions: ["pdf"] },
};

/**
 * Asks where to export and in which format. macOS shows a native save sheet
 * with an "Export To" menu; Windows and Linux use the "Save as type" list.
 */
export async function pickExportTarget(
  docPath: string | null,
  format: ExportFormat,
): Promise<ExportTarget | null> {
  const name = `${baseName(docPath)}.${format}`;
  if (detectOS() === "mac") {
    return invoke<ExportTarget | null>("choose_export", {
      name,
      directory: docPath ? dirName(docPath) : null,
      format,
    });
  }
  const other: ExportFormat = format === "html" ? "pdf" : "html";
  const path = await save({
    defaultPath: docPath ? `${dirName(docPath)}${docPath.includes("\\") ? "\\" : "/"}${name}` : name,
    filters: [exportFilters[format], exportFilters[other]],
  });
  if (!path) return null;
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "html" || ext === "pdf") return { path, format: ext };
  return { path: `${path}.${format}`, format };
}

/** Writes the webview's current page (the print copy) to a paginated PDF. */
export function exportPdf(path: string): Promise<void> {
  return invoke("export_pdf", { path });
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

/** The folder containing `path`. */
export function dirName(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, "");
}
