# mergie

`mergie` is a CLI tool that helps the user (Ayush) review GitHub pull requests through a
local web UI. **The complete product vision, requirements, and all locked product + tech
decisions live in [`SPEC.md`](./SPEC.md) — that file is the single source of truth for what to
build.** Re-read it whenever scope is unclear.

## Keep SPEC.md up to date (mandatory)

`SPEC.md` must always reflect the current intended behaviour of the tool. Whenever a feature is
**added, changed, or removed** — including changes agreed in conversation — **update `SPEC.md` in
the same piece of work** so it never drifts from reality. Do not record product/tech decisions in
this file; put them in `SPEC.md`.

## Working agreement with the user

- **The user will not read the code.** He reviews this project at the product/behaviour level,
  not the implementation level. When discussing a plan, a solution, a trade-off, or a problem,
  explain it in plain language and in terms of observable behaviour — not in terms of code,
  function names, or internal structure. Do not ask him to review diffs to make a decision.
  Surface decisions as product choices with concrete examples.
- This is a **single-user, local-first tool.** Optimise for a focused individual review workflow
  over the needs of a broad audience.

## How to build (mandatory)

- **Test-first, red-green (TDD).** For every unit of functionality:
  1. Write a failing test that describes the desired behaviour.
  2. Run it and confirm it fails for the right reason.
  3. Write the minimum code to make it pass.
  4. Refactor with the test staying green.
  Do not write implementation code before there is a failing test covering it.
- Follow the global code-style, testing, and git conventions from the user's `~/.claude/CLAUDE.md`
  and `CODE_STYLE.md` (sibling `__tests__/` mirroring source paths, JSDoc on types, no `as`/`any`
  without asking, conventional commits, feature branches + PRs, justify/ask before adding
  dependencies, etc.).

## Running mergie from a worktree (mandatory)

The primary daemon (the user's live review sessions) runs on **port 4517** with data under
`~/.config/mergie`. When invoking mergie from inside a **git worktree**, never run the plain
`mergie` command or `bun run src/main.ts` directly — both would collide with that primary
daemon (same port and, unless overridden, same data dir) and disturb ongoing reviews.

A bare `src/main.ts` run is now **blocked by a source-run guard** (it detects the repo's `.git`
and exits with guidance) precisely to prevent this collision. Instead, always launch via
**`bin/mergie-dev`**, which runs an **isolated** instance:
- its own port (`MERGIE_PORT`, default **4518**),
- its own data directory (`XDG_DATA_HOME` → `<worktree>/devdata`, gitignored),
- sets `MERGIE_DEV=1` so it passes the source-run guard,
- config (models, AI-review templates) shared read-only with the primary instance.

```
bin/mergie-dev --no-open           # start the dev instance without opening a browser tab
bin/mergie-dev --pr <url> --no-open  # load a PR on the dev instance, no browser tab
bin/mergie-dev status
bin/mergie-dev stop                # stops ONLY the dev daemon (4518), never the primary
```

**Always pass `--no-open` when launching `bin/mergie-dev`.** Any open flow otherwise auto-opens a
tab in the user's default browser; `--no-open` starts/loads as usual and just prints the ready URL
instead. Only omit it if the user explicitly asks you to open a real browser tab. (Drive the UI
with playwright for verification, not the user's browser.)

Never run `mergie stop` from a worktree — that targets the primary daemon on 4517 and would kill
the user's live sessions.
