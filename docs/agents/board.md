# Project board

User stories live as issues in `keanedp/Awen`, tracked on the [Awen Board](https://github.com/users/keanedp/projects/3). The board is the source of truth for what's planned, in progress and done. `docs/backlog.md` is a frozen archive of the stories before the move (2026-10-03); don't update it.

## Columns

The board's `Status` field:
- **Backlog**: not started.
- **Ready**: planned and next up.
- **In progress**: someone is working on it. Assign yourself (agents: the person you're working for) and name the branch in a comment.
- **In review**: built, but not yet checked by running the app on the stated platforms, or its PR is waiting for review. Say in a comment what's unverified.
- **Done**: built and verified. The issue is closed as completed; moving a card to Done closes it automatically.

A story decided against is closed as "not planned", with one comment saying why.

## Writing a story

Title: a short user-facing outcome, e.g. "Find options". Body, in the same shape as the migrated stories:

```markdown
Status: Todo · Platforms: macOS, Windows
As a writer, I want …, so …
- [ ] Acceptance criterion
- [ ] Verified in the app on macOS
```

- **Acceptance criteria** are task-list checkboxes. Tick them in the issue body as they're met; a story is Done only when all are ticked.
- The `Status:` line from the old format can be dropped; the board column replaces it. Keep `Platforms:` and `Depends on:`.
- Set the **milestone** (M1, M2, M3) and add the issue to the board.
- Label `help wanted` on stories waiting only for a Windows check, so outside contributors can find them.
- Migrated stories keep their `W-0xx` ids in the title, and code, commits and these docs refer to them by that id. New stories have no `W-` id: refer to them as `#123`.

## Agents

When you work on a story:
- move it to In progress when you start, and to In review or Done when you finish;
- tick the criteria you've met in the issue body;
- add unit tests for the story's logic (see "Tests" in `architecture.md`);
- if you couldn't run it on every stated platform, leave it in In review and comment what's unverified;
- open a new issue for any follow-up work you discover;
- reference the issue in commits and PRs (`Fixes #123` closes it on merge).

`gh project` needs the `project` scope (`gh auth refresh -s project`).

```sh
# Open stories, and the board with each item's column
gh issue list -R keanedp/Awen --state open
gh project item-list 3 --owner keanedp --limit 200

# New story, added to the board
gh issue create -R keanedp/Awen --title "…" --body-file story.md --milestone "M2: Focus, preview and output"
gh project item-add 3 --owner keanedp --url <issue-url>

# Move a card: the item id comes from `item-list --format json`
gh project item-edit --project-id PVT_kwHOADXuH84BloHj --field-id PVTSSF_lAHOADXuH84BloHjzhkUOu4 \
  --id <item-id> --single-select-option-id <option>
```

Status option ids: Backlog `f75ad846`, Ready `61e4505c`, In progress `47fc9ee4`, In review `df73e18b`, Done `98236657`.
