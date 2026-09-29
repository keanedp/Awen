import { describe, expect, it } from "vitest";
import {
  readVersions,
  setCargoLockVersion,
  setCargoTomlVersion,
  setPackageVersion,
  validateVersion,
} from "./version.mjs";

describe("validateVersion", () => {
  it("accepts x.y.z and a numeric pre-release", () => {
    expect(() => validateVersion("0.1.0")).not.toThrow();
    expect(() => validateVersion("1.2.3-4")).not.toThrow();
  });

  it("rejects what MSI can't take", () => {
    for (const bad of ["1.2", "v1.2.3", "1.2.3-beta.1", "1.2.3+build", "256.0.0", "0.256.0", "0.0.65536", "1.0.0-65536"]) {
      expect(() => validateVersion(bad), bad).toThrow();
    }
  });
});

describe("setPackageVersion", () => {
  it("sets the root version and the lockfile's root package", () => {
    const lock = JSON.stringify(
      { name: "awen", version: "0.1.0", packages: { "": { name: "awen", version: "0.1.0" }, "node_modules/x": { version: "0.1.0" } } },
      null,
      2,
    );
    const out = JSON.parse(setPackageVersion(lock, "0.2.0"));
    expect(out.version).toBe("0.2.0");
    expect(out.packages[""].version).toBe("0.2.0");
    expect(out.packages["node_modules/x"].version).toBe("0.1.0");
  });
});

describe("setCargoTomlVersion", () => {
  const toml = `[package]\nname = "awen"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n\n[dev]\nversion = "9"\n`;

  it("changes only the [package] version", () => {
    expect(setCargoTomlVersion(toml, "0.2.0")).toBe(toml.replace('version = "0.1.0"', 'version = "0.2.0"'));
  });

  it("throws without a [package] version", () => {
    expect(() => setCargoTomlVersion("[dependencies]\nversion = \"1\"\n", "0.2.0")).toThrow();
  });
});

describe("setCargoLockVersion", () => {
  const lock = `[[package]]\nname = "atk"\nversion = "0.1.0"\n\n[[package]]\nname = "awen"\nversion = "0.1.0"\ndependencies = []\n`;

  it("changes only the awen entry", () => {
    const out = setCargoLockVersion(lock, "0.2.0");
    expect(out).toContain('name = "atk"\nversion = "0.1.0"');
    expect(out).toContain('name = "awen"\nversion = "0.2.0"');
  });
});

describe("readVersions", () => {
  it("reads every copy", () => {
    const files: Record<string, string> = {
      "package.json": '{"version": "0.3.0"}',
      "package-lock.json": '{"version": "0.3.0", "packages": {"": {"version": "0.2.0"}}}',
      "src-tauri/Cargo.toml": '[package]\nname = "awen"\nversion = "0.3.0"\n',
      "src-tauri/Cargo.lock": '\nname = "awen"\nversion = "0.3.0"\n',
    };
    expect(readVersions((file: string) => files[file])).toEqual({
      "package.json": "0.3.0",
      "package-lock.json": "0.2.0",
      "src-tauri/Cargo.toml": "0.3.0",
      "src-tauri/Cargo.lock": "0.3.0",
    });
  });
});
