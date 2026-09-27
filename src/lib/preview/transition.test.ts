import { describe, expect, test } from "vitest";
import { previewFade, RISE } from "./transition";

const node = {} as Element;

describe("the preview's transition", () => {
  test("fades in while rising into place", () => {
    const { css } = previewFade(node, { entering: true, reduceMotion: false });
    expect(css!(0, 1)).toBe(`opacity: 0; transform: translateY(${RISE}px)`);
    expect(css!(1, 0)).toBe("opacity: 1; transform: translateY(0px)");
  });

  test("fades out without moving", () => {
    const { css } = previewFade(node, { entering: false, reduceMotion: false });
    expect(css!(0.5, 0.5)).toBe("opacity: 0.5");
  });

  test("only fades with Reduce Motion on", () => {
    const { css } = previewFade(node, { entering: true, reduceMotion: true });
    expect(css!(0, 1)).toBe("opacity: 0");
  });

  test("leaves faster than it arrives", () => {
    const into = previewFade(node, { entering: true, reduceMotion: false });
    const out = previewFade(node, { entering: false, reduceMotion: false });
    expect(out.duration!).toBeLessThan(into.duration!);
  });
});
