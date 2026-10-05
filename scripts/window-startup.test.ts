import { describe, expect, it } from "vitest";
import baseConfig from "../src-tauri/tauri.conf.json";
import windowsConfig from "../src-tauri/tauri.windows.conf.json";

describe("document window startup", () => {
  // Tauri's platform merge replaces the entire windows array. An override
  // cannot inherit visibility from the base window configuration.
  it.each([
    ["base", baseConfig],
    ["Windows", windowsConfig],
  ] as const)("keeps %s windows hidden until the styled page shows them", (_platform, config) => {
    expect(config.app.windows.length).toBeGreaterThan(0);
    for (const window of config.app.windows) {
      expect(window.visible).toBe(false);
    }
  });
});
