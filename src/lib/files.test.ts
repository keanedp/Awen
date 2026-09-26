import { describe, expect, test } from "vitest";
import { baseName, defaultExportPath, dirName, exportTarget, fileName } from "./files";

describe("fileName", () => {
  test.each([
    ["/Users/me/Notes.md", "Notes.md"],
    ["C:\\Users\\me\\Notes.md", "Notes.md"],
    ["C:\\Users\\me/Mixed.md", "Mixed.md"],
    ["Notes.md", "Notes.md"],
  ])("%s", (path, name) => {
    expect(fileName(path)).toBe(name);
  });

  test("an untitled document", () => {
    expect(fileName(null)).toBe("Untitled");
  });
});

describe("baseName", () => {
  test.each([
    ["/a/Notes.md", "Notes"],
    ["/a/notes.v2.md", "notes.v2"],
    ["/a/README", "README"],
    ["C:\\a\\Notes.markdown", "Notes"],
    [null, "Untitled"],
  ])("%s", (path, name) => {
    expect(baseName(path)).toBe(name);
  });
});

describe("dirName", () => {
  test.each([
    ["/Users/me/Notes.md", "/Users/me"],
    ["/Users/me/My Folder/Notes.md", "/Users/me/My Folder"],
    ["C:\\Users\\me\\Notes.md", "C:\\Users\\me"],
    ["\\\\server\\share\\Notes.md", "\\\\server\\share"],
  ])("%s", (path, folder) => {
    expect(dirName(path)).toBe(folder);
  });
});

describe("defaultExportPath", () => {
  test("beside the document, with the format's extension", () => {
    expect(defaultExportPath("/Users/me/Notes.md", "pdf")).toBe("/Users/me/Notes.pdf");
    expect(defaultExportPath("/Users/me/notes.v2.md", "html")).toBe("/Users/me/notes.v2.html");
  });

  test("keeps Windows separators", () => {
    expect(defaultExportPath("C:\\Users\\me\\Notes.md", "html")).toBe("C:\\Users\\me\\Notes.html");
  });

  test("an untitled document has only a name", () => {
    expect(defaultExportPath(null, "pdf")).toBe("Untitled.pdf");
  });
});

describe("exportTarget", () => {
  test.each([
    ["/a/Notes.pdf", "html", { path: "/a/Notes.pdf", format: "pdf" }],
    ["/a/Notes.html", "pdf", { path: "/a/Notes.html", format: "html" }],
    ["/a/Notes.PDF", "html", { path: "/a/Notes.PDF", format: "pdf" }],
    ["/a/Notes", "pdf", { path: "/a/Notes.pdf", format: "pdf" }],
    ["/a/Notes.txt", "html", { path: "/a/Notes.txt.html", format: "html" }],
  ] as const)("%s chosen with %s selected", (path, format, target) => {
    expect(exportTarget(path, format)).toEqual(target);
  });
});
