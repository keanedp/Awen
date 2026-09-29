// The app version lives in package.json (tauri.conf.json points there), but
// Cargo.toml, Cargo.lock and package-lock.json keep their own copies.
//
//   node scripts/version.mjs set 0.2.0     write the version everywhere
//   node scripts/version.mjs check 0.2.0   fail unless every copy is 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Windows installers limit what a version can be: MSI allows major and minor
// up to 255, patch up to 65535, and only a numeric pre-release (0.2.0-1).
export function validateVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(version);
  if (!match) {
    throw new Error(`"${version}" is not x.y.z or x.y.z-n (MSI allows only a numeric pre-release)`);
  }
  const [major, minor, patch, pre] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  if (major > 255 || minor > 255 || patch > 65535 || pre > 65535) {
    throw new Error(`"${version}" is out of range for MSI (major and minor ≤ 255, patch and pre-release ≤ 65535)`);
  }
}

// package.json and package-lock.json: npm writes them as 2-space JSON.
export function setPackageVersion(text, version) {
  const json = JSON.parse(text);
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  return JSON.stringify(json, null, 2) + "\n";
}

// The first `version = "…"` of the [package] table.
export function setCargoTomlVersion(text, version) {
  const pattern = /(\[package\][^[]*?\nversion\s*=\s*")[^"]*(")/;
  if (!pattern.test(text)) throw new Error("Cargo.toml has no [package] version");
  return text.replace(pattern, `$1${version}$2`);
}

// The awen entry in Cargo.lock.
export function setCargoLockVersion(text, version) {
  const pattern = /(\nname = "awen"\r?\nversion = ")[^"]*(")/;
  if (!pattern.test(text)) throw new Error('Cargo.lock has no "awen" package');
  return text.replace(pattern, `$1${version}$2`);
}

export function readVersions(read) {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  return {
    "package.json": pkg.version,
    "package-lock.json": lock.packages?.[""]?.version ?? lock.version,
    "src-tauri/Cargo.toml": /\[package\][^[]*?\nversion\s*=\s*"([^"]*)"/.exec(read("src-tauri/Cargo.toml"))?.[1],
    "src-tauri/Cargo.lock": /\nname = "awen"\r?\nversion = "([^"]*)"/.exec(read("src-tauri/Cargo.lock"))?.[1],
  };
}

const edits = {
  "package.json": setPackageVersion,
  "package-lock.json": setPackageVersion,
  "src-tauri/Cargo.toml": setCargoTomlVersion,
  "src-tauri/Cargo.lock": setCargoLockVersion,
};

function main([command, version]) {
  if (!["set", "check"].includes(command) || !version) {
    throw new Error("usage: node scripts/version.mjs set|check <x.y.z>");
  }
  version = version.replace(/^v/, "");
  validateVersion(version);
  const read = (file) => readFileSync(root + file, "utf8");
  if (command === "set") {
    for (const [file, edit] of Object.entries(edits)) writeFileSync(root + file, edit(read(file), version));
    console.log(`Version set to ${version}`);
  } else {
    const wrong = Object.entries(readVersions(read)).filter(([, found]) => found !== version);
    if (wrong.length) {
      throw new Error(wrong.map(([file, found]) => `${file} has ${found}, expected ${version}`).join("\n"));
    }
    console.log(`All files are at ${version}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
