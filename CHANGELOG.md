# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org).

## [0.3.0] - 2026-07-22

### Added
- **Large hunks collapse by default.** A hunk with 500 or more changed lines (additions +
  deletions) is now hidden behind a "Load diff" button showing its changed-line count, so a single
  huge hunk no longer slows the page or buries the rest of the review. Clicking Load diff renders
  it in place; jumping to a comment inside a large hunk loads it automatically. Collapsed hunks
  still count toward the review-progress ring. The threshold is configurable via
  `largeDiffThreshold` in `config.toml` (default 500; `0` disables collapsing).

## [0.2.1] - 2026-07-22

### Added
- **`mergie help` and `mergie version`.** `mergie version` (`-v`/`--version`) prints the installed
  version; `mergie help` (`-h`/`--help`) prints full usage, and `mergie help <command>` prints
  help for one command. `-h`/`-v` anywhere on the line win over the rest (help beats version), and
  parse errors now point at the matching `mergie help` command.

## [0.2.0] - 2026-07-22

### Added
- **Startup checks.** mergie now verifies its environment before doing work:
  - If **Bun is not installed**, the `mergie` command prints install guidance instead of a cryptic
    `env: bun: not found` — so a global install via a non-Bun package manager (npm/pnpm) on a
    machine without Bun fails clearly.
  - On the open flows (`mergie`, `--pr`, `reload`), mergie **aborts with next steps** if Bun is
    older than 1.2, or if `gh` is missing or not signed in. `stop`/`status` are exempt.
  - It **warns** (without blocking) for each missing optional tool, naming the disabled feature:
    `rg` (General search), `sem` (Symbol lookups), `claude` (AI review & chat).

## [0.1.1] - 2026-07-21

### Fixed
- **Cloning no longer requires SSH.** Clone/fetch now go over **HTTPS, authenticated by the `gh`
  credential helper**, so mergie works with just `gh auth login` — no SSH key or `known_hosts`
  trust needed. This fixes the repeating `The authenticity of host 'github.com' can't be
  established` prompt that could hang PR loading on a machine without SSH set up.

### Added
- **GitHub Enterprise support** — clones now use the pull request's own host instead of assuming
  `github.com`.

## [0.1.0] - 2026-07-20

### Added
- Initial public release: review GitHub pull requests from a fast local web UI, driven by the
  `mergie` CLI.
- Incremental review by **commit range**, per-hunk **viewed** state with a **progress ring**,
  **comments** that post/edit/delete on GitHub, optional **AI review & chat**, fuzzy file and
  symbol search, and filters to hide viewed, lock/generated, or whitespace-only changes.
- Ships a **prebuilt UI**, so `bun install -g mergie-cli` needs no build toolchain.

[0.3.0]: https://github.com/ayushpoddar/mergie/releases/tag/v0.3.0
[0.2.1]: https://github.com/ayushpoddar/mergie/releases/tag/v0.2.1
[0.2.0]: https://github.com/ayushpoddar/mergie/releases/tag/v0.2.0
[0.1.1]: https://github.com/ayushpoddar/mergie/releases/tag/v0.1.1
[0.1.0]: https://github.com/ayushpoddar/mergie/releases/tag/v0.1.0
