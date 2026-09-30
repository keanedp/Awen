// Writes the updater's latest.json (W-071) from the release's updater
// signatures. Installed copies fetch it from releases/latest/download/, so it
// only goes live when the draft release is published.
//
//   node scripts/latest-json.mjs <tag> <download url> <dir with .sig files>
//
// The download url is the release's, e.g.
// https://github.com/keanedp/Awen/releases/download/v0.3.0
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Updater targets by file name, as release.yml names the uploads. Windows
// installs update with the kind of installer they came from; `windows-x86_64`
// is the fallback for copies that don't know (the updater tries
// `<os>-<arch>-<bundle>` first).
const platforms = [
  [/_aarch64\.app\.tar\.gz$/, ["darwin-aarch64"]],
  [/_x64\.app\.tar\.gz$/, ["darwin-x86_64"]],
  [/_x64-setup\.exe$/, ["windows-x86_64-nsis", "windows-x86_64"]],
  [/_x64_[\w-]+\.msi$/, ["windows-x86_64-msi"]],
];

/** The manifest for `version`, from `{ file: signature }` of the updater artifacts. */
export function manifest(version, downloadUrl, signatures, date = new Date()) {
  const result = { version, notes: `Awen ${version}`, pub_date: date.toISOString(), platforms: {} };
  for (const [file, signature] of Object.entries(signatures)) {
    const keys = platforms.find(([pattern]) => pattern.test(file))?.[1];
    if (!keys) throw new Error(`No updater platform for ${file}`);
    const url = `${downloadUrl.replace(/\/$/, "")}/${encodeURIComponent(file)}`;
    for (const key of keys) result.platforms[key] = { signature: signature.trim(), url };
  }
  if (!Object.keys(result.platforms).length) throw new Error("No updater signatures");
  return result;
}

function main([tag, downloadUrl, dir]) {
  if (!tag || !downloadUrl || !dir) {
    throw new Error("usage: node scripts/latest-json.mjs <tag> <download url> <dir>");
  }
  const signatures = Object.fromEntries(
    readdirSync(dir)
      .filter((name) => name.endsWith(".sig"))
      .map((name) => [name.slice(0, -".sig".length), readFileSync(join(dir, name), "utf8")]),
  );
  console.log(JSON.stringify(manifest(tag.replace(/^v/, ""), downloadUrl, signatures), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
