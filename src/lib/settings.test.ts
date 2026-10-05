import { describe, expect, test } from "vitest";
import { defaults } from "./preferences";
import {
  activeFocus,
  biggerText,
  defaultTextSize,
  isTextSize,
  settingsContentHeight,
  smallerText,
  textSizes,
  viewChange,
  writingFonts,
  writingStyle,
} from "./settings";

describe("text size steps", () => {
  test("the default is one of the stops", () => {
    expect(textSizes).toContain(defaultTextSize);
    expect(defaults.textSize).toBe(defaultTextSize);
  });

  test("Bigger and Smaller move one stop", () => {
    expect(biggerText(18)).toBe(20);
    expect(smallerText(18)).toBe(17);
    expect(smallerText(20)).toBe(18);
  });

  test("they stop at either end", () => {
    const [min, max] = [textSizes[0], textSizes[textSizes.length - 1]];
    expect(biggerText(max)).toBe(max);
    expect(smallerText(min)).toBe(min);
  });

  test("a size between stops moves to the nearest stop in that direction", () => {
    expect(biggerText(19)).toBe(20);
    expect(smallerText(19)).toBe(18);
  });

  test("every step lands on a valid size", () => {
    for (const size of textSizes) {
      expect(isTextSize(biggerText(size))).toBe(true);
      expect(isTextSize(smallerText(size))).toBe(true);
    }
  });
});

describe("writingStyle", () => {
  const neon = `--font-writing: ${writingFonts.neon}`;

  test("the defaults match the tokens in app.css", () => {
    expect(writingStyle(defaults)).toBe(`${neon}; --writing-size: 18px; --writing-line-height: 1.6; --measure: 66ch`);
  });

  test("each choice sets its token", () => {
    expect(writingStyle({ writingFont: "neon", textSize: 22, columnWidth: "narrow", lineSpacing: "loose" })).toBe(
      `${neon}; --writing-size: 22px; --writing-line-height: 1.8; --measure: 58ch`,
    );
    expect(writingStyle({ writingFont: "neon", textSize: 14, columnWidth: "wide", lineSpacing: "tight" })).toBe(
      `${neon}; --writing-size: 14px; --writing-line-height: 1.4; --measure: 80ch`,
    );
  });

  test("each font sets its stack", () => {
    expect(writingStyle({ ...defaults, writingFont: "neon" })).toContain(`--font-writing: "Monaspace Neon", `);
    expect(writingStyle({ ...defaults, writingFont: "argon" })).toContain(`--font-writing: "Monaspace Argon", `);
    expect(writingStyle({ ...defaults, writingFont: "radon" })).toContain(`--font-writing: "Monaspace Radon", `);
    expect(writingStyle({ ...defaults, writingFont: "system" })).toContain("--font-writing: ui-monospace, ");
  });

  test("every stack ends in a generic monospace", () => {
    for (const stack of Object.values(writingFonts)) expect(stack).toMatch(/, monospace$/);
  });
});

describe("settingsContentHeight", () => {
  test("fits the page in the monitor work area with title bar room", () => {
    expect(settingsContentHeight(912, 883)).toBe(835);
    expect(settingsContentHeight(500, 883)).toBe(500);
  });

  test("keeps a usable scroll area on short displays", () => {
    expect(settingsContentHeight(912, 260)).toBe(240);
  });
});

describe("activeFocus", () => {
  test("does nothing while focus mode is off", () => {
    expect(activeFocus({ focusMode: false, focusUnit: "paragraph" })).toEqual({ dim: null, typewriter: false });
    expect(activeFocus({ focusMode: false, focusUnit: "typewriter" })).toEqual({ dim: null, typewriter: false });
  });

  test("Sentence and Paragraph dim; Typewriter centers the line instead", () => {
    expect(activeFocus({ focusMode: true, focusUnit: "sentence" })).toEqual({ dim: "sentence", typewriter: false });
    expect(activeFocus({ focusMode: true, focusUnit: "paragraph" })).toEqual({ dim: "paragraph", typewriter: false });
    expect(activeFocus({ focusMode: true, focusUnit: "typewriter" })).toEqual({ dim: null, typewriter: true });
  });
});

describe("viewChange", () => {
  const prefs = { ...defaults, textSize: 20 };

  test("Word Count and Code Highlighting toggle", () => {
    expect(viewChange("word_count", prefs)).toEqual({ wordCount: !prefs.wordCount });
    expect(viewChange("code_highlighting", prefs)).toEqual({ codeHighlighting: !prefs.codeHighlighting });
  });

  test("Focus Mode toggles, and choosing what to focus on turns it on", () => {
    expect(viewChange("focus_mode", prefs)).toEqual({ focusMode: true });
    expect(viewChange("focus_mode", { ...prefs, focusMode: true })).toEqual({ focusMode: false });
    expect(viewChange("focus_sentence", prefs)).toEqual({ focusMode: true, focusUnit: "sentence" });
    expect(viewChange("focus_paragraph", prefs)).toEqual({ focusMode: true, focusUnit: "paragraph" });
    expect(viewChange("focus_typewriter", prefs)).toEqual({ focusMode: true, focusUnit: "typewriter" });
  });

  test("Bigger, Smaller and Actual Size set the text size", () => {
    expect(viewChange("text_bigger", prefs)).toEqual({ textSize: 22 });
    expect(viewChange("text_smaller", prefs)).toEqual({ textSize: 18 });
    expect(viewChange("text_actual", prefs)).toEqual({ textSize: defaultTextSize });
  });

  test("other commands change no preference", () => {
    expect(viewChange("preview", prefs)).toBeNull();
    expect(viewChange("save", prefs)).toBeNull();
  });
});
