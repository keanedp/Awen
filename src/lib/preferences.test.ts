import { beforeEach, describe, expect, test, vi } from "vitest";
import { defaults, loadPreferences, onPreferenceChanged, parsePreferences, setPreference } from "./preferences";

const ipc = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, handler: (event: { payload: unknown }) => void) => {
    ipc.listeners.set(event, handler);
    return () => ipc.listeners.delete(event);
  },
}));

beforeEach(() => {
  ipc.invoke.mockReset();
  ipc.listeners.clear();
});

describe("parsePreferences", () => {
  test("nothing saved gives the defaults", () => {
    expect(parsePreferences({})).toEqual(defaults);
  });

  test("saved values replace the defaults", () => {
    expect(parsePreferences({ wordCount: false, exportFormat: "pdf" })).toEqual({
      wordCount: false,
      exportFormat: "pdf",
    });
  });

  test("invalid values fall back to the default", () => {
    expect(parsePreferences({ wordCount: "no", exportFormat: "docx" })).toEqual(defaults);
    expect(parsePreferences({ wordCount: null, exportFormat: 1 })).toEqual(defaults);
  });

  test("unknown keys, e.g. from a newer version, are ignored", () => {
    expect(parsePreferences({ focusMode: true, toString: 1 })).toEqual(defaults);
  });

  test("defaults are never changed", () => {
    parsePreferences({ wordCount: !defaults.wordCount });
    expect(parsePreferences({})).toEqual(defaults);
  });
});

test("loadPreferences reads and checks what Rust saved", async () => {
  ipc.invoke.mockResolvedValue({ wordCount: false, exportFormat: "rtf" });
  expect(await loadPreferences()).toEqual({ ...defaults, wordCount: false });
  expect(ipc.invoke).toHaveBeenCalledWith("preferences");
});

test("setPreference sends the key and value", async () => {
  ipc.invoke.mockResolvedValue(undefined);
  await setPreference("exportFormat", "pdf");
  expect(ipc.invoke).toHaveBeenCalledWith("set_preference", { key: "exportFormat", value: "pdf" });
});

test("onPreferenceChanged passes on valid changes only", async () => {
  const apply = vi.fn();
  await onPreferenceChanged(apply);
  const emit = (payload: unknown) => ipc.listeners.get("preference-changed")!({ payload });
  emit({ key: "wordCount", value: false });
  emit({ key: "wordCount", value: "false" });
  emit({ key: "somethingNew", value: true });
  expect(apply.mock.calls).toEqual([[{ wordCount: false }]]);
});
