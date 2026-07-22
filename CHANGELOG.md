# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org).

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

[0.2.0]: https://github.com/ayushpoddar/mergie/releases/tag/v0.2.0
[0.1.1]: https://github.com/ayushpoddar/mergie/releases/tag/v0.1.1
[0.1.0]: https://github.com/ayushpoddar/mergie/releases/tag/v0.1.0
