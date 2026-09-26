import { describe, expect, test } from "vitest";
import { defaults } from "./preferences";
import { biggerText, defaultTextSize, isTextSize, smallerText, textSizes, viewChange, writingStyle } from "./settings";

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
  test("the defaults match the tokens in app.css", () => {
    expect(writingStyle(defaults)).toBe("--writing-size: 18px; --writing-line-height: 1.6; --measure: 66ch");
  });

  test("each choice sets its token", () => {
    expect(writingStyle({ textSize: 22, columnWidth: "narrow", lineSpacing: "loose" })).toBe(
      "--writing-size: 22px; --writing-line-height: 1.8; --measure: 58ch",
    );
    expect(writingStyle({ textSize: 14, columnWidth: "wide", lineSpacing: "tight" })).toBe(
      "--writing-size: 14px; --writing-line-height: 1.4; --measure: 80ch",
    );
  });
});

describe("viewChange", () => {
  const prefs = { ...defaults, textSize: 20 };

  test("Word Count and Code Highlighting toggle", () => {
    expect(viewChange("word_count", prefs)).toEqual({ wordCount: !prefs.wordCount });
    expect(viewChange("code_highlighting", prefs)).toEqual({ codeHighlighting: !prefs.codeHighlighting });
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
