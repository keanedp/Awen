import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  defaults,
  loadPreferences,
  onPreferenceChanged,
  parsePreferences,
  setPreference,
  setPreferences,
} from "./preferences";

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
    const saved = {
      wordCount: false,
      codeHighlighting: true,
      exportFormat: "pdf",
      writingFont: "radon",
      textSize: 22,
      columnWidth: "wide",
      lineSpacing: "loose",
      spellcheck: false,
      theme: "dark",
    };
    expect(parsePreferences(saved)).toEqual(saved);
  });

  test("invalid values fall back to the default", () => {
    expect(parsePreferences({ wordCount: "no", codeHighlighting: 1, exportFormat: "docx" })).toEqual(defaults);
    expect(parsePreferences({ wordCount: null, exportFormat: 1 })).toEqual(defaults);
    expect(parsePreferences({ writingFont: "Monaspace Neon" })).toEqual(defaults);
    // Classic Mono, no longer offered: back to the default.
    expect(parsePreferences({ writingFont: "classic" })).toEqual(defaults);
    expect(
      parsePreferences({ textSize: "18", columnWidth: "huge", lineSpacing: 1.6, spellcheck: "on", theme: "sepia" }),
    ).toEqual(defaults);
  });

  test("text sizes outside the slider's range fall back to the default", () => {
    expect(parsePreferences({ textSize: 4 }).textSize).toBe(defaults.textSize);
    expect(parsePreferences({ textSize: 200 }).textSize).toBe(defaults.textSize);
    expect(parsePreferences({ textSize: Number.NaN }).textSize).toBe(defaults.textSize);
    // Hand-edited, between two stops: kept.
    expect(parsePreferences({ textSize: 19 }).textSize).toBe(19);
  });

  test("option names inherited from Object aren't valid choices", () => {
    expect(parsePreferences({ columnWidth: "toString", lineSpacing: "constructor", writingFont: "valueOf" })).toEqual(defaults);
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

test("setPreferences sends each key and value", async () => {
  ipc.invoke.mockResolvedValue(undefined);
  await setPreferences({ textSize: 20, theme: "dark" });
  expect(ipc.invoke.mock.calls).toEqual([
    ["set_preference", { key: "textSize", value: 20 }],
    ["set_preference", { key: "theme", value: "dark" }],
  ]);
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
