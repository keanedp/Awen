import { describe, expect, it } from "vitest";
import { manifest } from "./latest-json.mjs";

const url = "https://github.com/keanedp/Awen/releases/download/v0.3.0";
const date = new Date("2026-09-29T12:00:00Z");

describe("manifest", () => {
  it("maps each updater artifact to its platforms", () => {
    const out = manifest(
      "0.3.0",
      url,
      {
        "Awen_0.3.0_aarch64.app.tar.gz": "arm\n",
        "Awen_0.3.0_x64.app.tar.gz": "intel",
        "Awen_0.3.0_x64-setup.exe": "nsis",
        "Awen_0.3.0_x64_en-US.msi": "msi",
      },
      date,
    );
    expect(out.version).toBe("0.3.0");
    expect(out.pub_date).toBe("2026-09-29T12:00:00.000Z");
    expect(out.platforms).toEqual({
      "darwin-aarch64": { signature: "arm", url: `${url}/Awen_0.3.0_aarch64.app.tar.gz` },
      "darwin-x86_64": { signature: "intel", url: `${url}/Awen_0.3.0_x64.app.tar.gz` },
      "windows-x86_64-nsis": { signature: "nsis", url: `${url}/Awen_0.3.0_x64-setup.exe` },
      "windows-x86_64": { signature: "nsis", url: `${url}/Awen_0.3.0_x64-setup.exe` },
      "windows-x86_64-msi": { signature: "msi", url: `${url}/Awen_0.3.0_x64_en-US.msi` },
    });
  });

  it("works with only the macOS builds", () => {
    const out = manifest("0.3.0", `${url}/`, { "Awen_0.3.0_x64.app.tar.gz": "intel" }, date);
    expect(Object.keys(out.platforms)).toEqual(["darwin-x86_64"]);
    expect(out.platforms["darwin-x86_64"].url).toBe(`${url}/Awen_0.3.0_x64.app.tar.gz`);
  });

  it("rejects unknown files and an empty release", () => {
    expect(() => manifest("0.3.0", url, { "Awen.app.tar.gz": "x" })).toThrow(/Awen\.app\.tar\.gz/);
    expect(() => manifest("0.3.0", url, {})).toThrow(/No updater signatures/);
  });
});
