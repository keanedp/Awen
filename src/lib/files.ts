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

/** The document Rust opened this window for, if any. `path` is null for an untitled copy. */
export function takeInitialDocument(): Promise<{ path: string | null; text: string } | null> {
  return invoke("take_initial_document");
}

/** Tells Rust which file this window now shows (after Save As). */
export function setDocumentPath(path: string): Promise<void> {
  return invoke("set_document_path", { path });
}

/** Shows unsaved changes as the dot in the macOS close button. */
export function setDocumentEdited(edited: boolean): Promise<void> {
  return invoke("set_document_edited", { edited });
}

/** This window kept its unsaved changes, so an ongoing Quit stops. */
export function cancelQuit(): Promise<void> {
  return invoke("cancel_quit");
}

export function writeDocument(path: string, contents: string): Promise<void> {
  return invoke("write_document", { path, contents });
}

/** Saves an untitled document for the first time; fails rather than overwrite a file. */
export function createDocument(path: string, contents: string): Promise<void> {
  return invoke("create_document", { path, contents });
}

/** Opens an untitled copy of `text` in a new window. */
export function duplicateDocument(text: string): Promise<void> {
  return invoke("duplicate_document", { text });
}

/** What the title popover asked for. `tags` and `locked` are set only when they changed. */
export interface DocumentInfo {
  name: string;
  directory: string;
  tags: string[] | null;
  locked: boolean | null;
}

/**
 * macOS: shows the native Name / Tags / Where popover under `anchor`.
 * Null when cancelled or nothing changed.
 */
export function showDocumentInfo(anchor: DOMRect, path: string | null): Promise<DocumentInfo | null> {
  const { x, y, width, height } = anchor;
  return invoke("show_document_info", { anchor: { x, y, width, height }, path });
}

/** Renames or moves this window's file; fails rather than overwrite a file. */
export function moveDocument(from: string, to: string): Promise<void> {
  return invoke("move_document", { from, to });
}

/** Replaces the file's Finder tags (macOS). */
export function setFileTags(path: string, tags: string[]): Promise<void> {
  return invoke("set_file_tags", { path, tags });
}

/** Sets or clears the file's locked flag (macOS). */
export function setFileLocked(path: string, locked: boolean): Promise<void> {
  return invoke("set_file_locked", { path, locked });
}

/** Whether the file is locked. Always false outside macOS. */
export function isFileLocked(path: string): Promise<boolean> {
  return invoke("is_file_locked", { path });
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
