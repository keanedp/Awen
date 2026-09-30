# How updates work

Awen updates itself with [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) (W-071). This page explains what a release ships for the updater, what an installed copy does with it, and how to keep it working. The code is in `src-tauri/src/updates.rs`, `.github/workflows/release.yml` and `scripts/latest-json.mjs`. The reasons behind the design are in `docs/agents/decisions.md`.

## What a release ships

Besides the DMGs, each release has three kinds of file for the updater.

### The archive: `Awen_<version>_<arch>.app.tar.gz`

`Awen.app`, packed as a gzipped tar: `Awen.app/Contents/...` and nothing else. The DMG is only for first installs; updates never use it.

- `release.yml` turns it on with `--config '{"bundle":{"createUpdaterArtifacts":true}}'`. It isn't in `tauri.conf.json`, so a local `make build` doesn't need the private key.
- Tauri names it `Awen.app.tar.gz` for both architectures. The upload step renames it (and its `.sig`) to `Awen_<version>_aarch64` or `_x64`, like the DMGs.

### The signature: `.app.tar.gz.sig`

A [minisign](https://jedisct1.github.io/minisign/) signature of the archive, stored as base64. The build makes it with the private key from the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secrets.

The matching public key is `plugins.updater.pubkey` in `tauri.conf.json`, compiled into every copy of Awen. An installed copy refuses any download whose signature doesn't match it. So even someone who could replace a file on a release can't ship their own build to users without the private key.

This is separate from Apple's code signing. The app in the archive is ad-hoc signed, as in the DMG.

### The manifest: `latest.json`

After both builds finish, the `manifest` job downloads the `.sig` files from the draft release, and `scripts/latest-json.mjs` writes one entry per platform:

```json
{
  "version": "0.3.0",
  "notes": "Awen 0.3.0",
  "pub_date": "2026-09-30T00:36:55.041Z",
  "platforms": {
    "darwin-aarch64": { "url": ".../Awen_0.3.0_aarch64.app.tar.gz", "signature": "..." },
    "darwin-x86_64": { "url": ".../Awen_0.3.0_x64.app.tar.gz", "signature": "..." }
  }
}
```

## What an installed copy does

1. **Check.** At launch (unless Settings → Automatically check for updates is off), or from Check for Updates… (Awen menu on macOS, Help on Windows), Awen fetches `https://github.com/keanedp/Awen/releases/latest/download/latest.json`.
   - GitHub serves that URL from the newest **published** release. Drafts and pre-releases don't count. `release.yml` marks any tag with a `-` (like `v0.4.0-1`) as a pre-release, so a test build can be published without offering it to everyone.
   - Debug builds (`make dev`) skip the launch check, since the updater can't replace a bare binary. Check for Updates… still works there, to try the dialogs.
2. **Compare.** If the manifest's version is newer than the running one, Awen picks its own platform's entry and asks: **Install and Relaunch** or **Later**. The launch check stays quiet otherwise. Check for Updates… also says when Awen is up to date, or when the check failed.
3. **Download and verify.** Awen downloads the archive and checks its signature against the built-in public key.
4. **Quit.** Awen closes its windows as Quit does, so each one asks about unsaved changes. Cancelling in any window drops the update; the next check offers it again. The app keeps running while the windows close.
5. **Install.** When the last window has closed, the updater unpacks the archive to a temporary folder, moves the current `Awen.app` aside as a backup, and moves the new one into its place. If the folder needs administrator rights, macOS asks for a password.
6. **Relaunch.** Awen restarts as the new version. If the install failed, it says why and relaunches the old version.

The updater downloads the archive itself, not through a browser, so the new app shouldn't get the quarantine flag that triggers Gatekeeper's "can't be opened" prompt. That's still to be confirmed with a real update (the last W-071 criterion).

## Windows

Windows releases are paused, but the pieces are in place for when they return. There's no separate archive: the updater downloads the `-setup.exe` (or `.msi`) itself, checks its `.sig`, and runs it. The installer closes Awen and relaunches it when done. `latest-json.mjs` already writes the `windows-x86_64` entries, and the upload step already looks for their `.sig` files.

## Releasing an update

Nothing changes from the usual release steps:

1. `make release VERSION=x.y.z`, then `git push origin HEAD vX.Y.Z`.
2. `release.yml` builds, signs and uploads everything to a draft release, then adds `latest.json`.
3. Check the draft and publish it. Installed copies see the update from that moment.

If a build fails with `incorrect updater private key password`, the password secret doesn't match the key. Fix the secret, then re-run the failed jobs: `gh run rerun <run id> --failed`.

## The signing key

- The private key is `~/.tauri/awen.key` on the maintainer's Mac, and in the GitHub secrets. It must never be committed.
- **Back up the key and its password.** Every installed copy only trusts the public key it was built with. If the key or password is lost, those copies can never update again, and users have to download a new version by hand.
- To replace the key anyway: `npx tauri signer generate -w ~/.tauri/awen.key -f`, update both secrets and `plugins.updater.pubkey`. Copies built with the old key won't accept updates signed with the new one.

## Limits

- Only 0.3.0 and later can update themselves. Anyone on 0.2.0 or earlier has to download a new version by hand once.
- The dialog doesn't show release notes, and there's no "Skip This Version". Later waits until the next launch.
