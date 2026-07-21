# mergie

**Review GitHub pull requests from a fast local web UI, driven by a small CLI.**

`mergie` clones a PR locally and serves a focused review interface in your browser — built for
reading diffs carefully, tracking what you've seen, leaving comments that post back to GitHub, and
(optionally) getting an AI review. It runs entirely on your machine and reuses your existing `gh`
login.

![mergie reviewing a pull request](docs/screenshot.png)

## Why

GitHub's web review is fine for small PRs, but it forgets what you've read, makes incremental
review (just the new commits since last time) awkward, and can't help you navigate a large diff.
`mergie` is built around those gaps:

- **Incremental review by commit range** — review only the commits added since you last looked,
  instead of re-reading the whole PR.
- **Progress you can trust** — mark hunks viewed; a ring shows how many are left, and viewed
  state persists across sessions and refreshes.
- **Comments that round-trip** — draft locally, then post, edit, or delete on GitHub; inbound
  review threads are synced in.
- **AI review & chat (optional)** — get an AI pass over a range, or ask questions about a hunk or
  file, powered by the Claude Agent SDK.
- **Made for big diffs** — fuzzy file search, symbol/code search across the PR, word-level diff
  highlighting, and filters to hide viewed, lock/generated, or whitespace-only changes.

## Requirements

- **[Bun](https://bun.sh)** ≥ 1.2 (mergie's runtime).
- **git** and the **[GitHub CLI](https://cli.github.com) (`gh`)**, authenticated
  (`gh auth login`). mergie reuses `gh`'s token for **both** API access and cloning — it clones over
  HTTPS via gh's credential helper, so **no SSH key or host-key setup is needed**.
- *(Optional, for AI features)* Claude access for the Claude Agent SDK — e.g. an
  `ANTHROPIC_API_KEY` in your environment.

## Install

```sh
bun install -g mergie-cli
# or run without installing:
bunx mergie-cli --pr https://github.com/withastro/astro/pull/17360
```

After a global install the command is simply `mergie`.

## Usage

```sh
mergie                                                  # open the home picker (no PR selected)
mergie --pr https://github.com/withastro/astro/pull/17360   # open a specific PR
mergie --no-open                                        # start/attach but don't open a browser tab
mergie reload                                           # restart the daemon (pick up UI changes)
mergie status                                           # is it running? which PRs are loaded?
mergie stop                                             # stop the daemon
```

The URL is parsed tolerantly — trailing `/files`, `/changes`, `#…` are ignored. The first call
starts a small background daemon that serves the web UI; later calls attach to it. One daemon
serves **multiple PRs at once**, switchable inside the UI.

## How it works

- For each PR, mergie keeps **one reusable local clone** containing both branches, and fetches it
  (via the **Refresh PR** action) to pick up new commits.
- Durable state — viewed hunks, comments, reviewed ranges, AI results, chat sessions — lives in a
  per-PR **SQLite** database under your data directory, so everything is restored when you reopen a
  PR.

## Configuration

- **Data & state:** `$XDG_DATA_HOME/mergie/` (falls back to your platform default).
- **Config:** a TOML file under `$XDG_CONFIG_HOME/mergie/` for lock-file glob patterns, the
  selectable Claude model list, and AI-review prompt templates.
- **Port:** the daemon binds **4517**; set `MERGIE_PORT` to change it. Combined with
  `XDG_DATA_HOME`, this lets a second, isolated instance run alongside the first.

## Development

```sh
git clone https://github.com/ayushpoddar/mergie.git
cd mergie
bun install
bun test          # run the test suite
bun run typecheck # tsc --noEmit
bun run start     # run from source
```

## License

[GPL-3.0-or-later](LICENSE). © Ayush Poddar.
