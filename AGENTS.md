# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others) when working with code in this repository.

Awen is a focused Markdown editor, built with Tauri 2 (Rust) + SvelteKit (Svelte 5 runes, TypeScript) + CodeMirror 6. Targets: macOS and Windows now, iOS/Android later from the same codebase. The overriding design goal is to look and behave as native as possible on each OS.

## Commands

- `make dev` (`npm run tauri dev`): run the app with hot reload.
- `make build` (`npm run tauri build`): release bundle (`.app` + `.dmg` on macOS, in `src-tauri/target/release/bundle/`).
- `npm run check`: svelte-check. Must report 0 errors/warnings.
- `npm test` (`make test`): Vitest unit tests (`src/**/*.test.ts`). Must pass.
- `npm run build`: frontend-only static build (fast sanity check).
- `cd src-tauri && cargo clippy` / `cargo fmt`: keep clippy warning-free. `cargo test` for Rust unit tests.

Verify with `npm test`, `npm run check`, `cargo clippy`, and by running the app.

## Map

- `src/routes/+page.svelte`: nearly all app logic (document state, file actions, preview, export, print).
- `src/lib/`: `editor/` (CodeMirror), `preview/` (markdown-it render + preview view), `export/`, `files.ts` (Tauri command wrappers), `platform.ts`.
- `src/styles/`: `app.css` + per-OS token files + `preview.css` (preview, print and export typography).
- `src-tauri/`: Rust side (menus, commands, native export/PDF). See `src-tauri/AGENTS.md`.

## Rules that are easy to break

- Native menu items drive the app: add the id in `src-tauri/src/menu.rs` (`FORWARDED`) **and** a handler in the `actions` map in `+page.svelte`.
- Read document text with `documentText()`, never `doc.toString()`. It preserves the file's original line endings.
- markdown-it stays `html: false`. Rendered content runs in a webview with IPC access.
- Style with the CSS tokens (`var(--surface)`, `bg-surface`, …), not hard-coded colours, so per-OS themes and dark mode keep working.
- Mark app chrome with the `.chrome` class (no selection, no web context menu).
- New features and bug fixes come with unit tests for their logic. Keep that logic out of `+page.svelte` and Svelte components, in plain modules that can be tested. See "Tests" in `docs/agents/architecture.md`.

## Backlog

`docs/backlog.md` holds the user stories and their status. Check it before starting feature work. Update the story's status and acceptance checkboxes as you go, following the rules at the top of that file.

## Knowledge base: read when relevant

- `docs/agents/architecture.md`: how the pieces connect: menu → event → action, editor, preview, print/PDF/HTML export, theming. Read before changing any of those flows.
- `docs/agents/decisions.md`: dated log of design decisions and why. Read before reversing or reworking a past choice.
- `docs/agents/gotchas.md`: environment quirks and failures already hit. **Skim before running builds, installing packages, or touching platform code.**
- `src-tauri/AGENTS.md`: Rust/native specifics.

## Keeping this knowledge current

These docs are the shared memory for every agent working here. They are committed and reviewed like code.
- When you learn something non-obvious (a gotcha, a decision and its reason, a structural change), record it in the same change you make:
  - decisions go in `decisions.md`, dated;
  - traps and quirks go in `gotchas.md`;
  - how things fit together goes in `architecture.md`;
  - area-specific notes go in the nearest `AGENTS.md`.
- Update or delete entries that have become wrong. A stale note is worse than none.
- Don't record what the code, `git log`, or a quick search already shows. Record the *why* and the non-obvious.
- Keep this file short (Codex truncates large instruction files). Put detail in `docs/agents/`.
- A new folder that needs its own notes gets an `AGENTS.md`, plus a `CLAUDE.md` containing only `@AGENTS.md` so Claude Code loads it too.
