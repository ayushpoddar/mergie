# mergie — Specification

`mergie` is a CLI tool for reviewing GitHub pull requests through a local web UI. It is a
**lightweight, single-user tool** that runs entirely on your own machine. This document is the
source of truth for product behaviour.

Primary invocation:

```
mergie                                                          # open the home picker
mergie --pr https://github.com/withastro/astro/pull/17360/changes   # open a PR directly
```

---

## 1. CLI & daemon

- `mergie` with **no arguments** starts/attaches to the daemon and opens the browser at the
  **home picker** (§4a) with **no PR selected**.
- `mergie --pr <url>` reviews a specific PR. The URL is parsed tolerantly — any trailing segment
  such as `/changes`, `/files`, `#...` is ignored; only host / org / repo / PR-number matter.
- `mergie reload` restarts the daemon: it **stops** the running daemon (waiting for it to exit),
  then performs the no-argument open flow (fresh start + home picker). Use it to pick up new UI
  changes.
- `mergie --no-open` (valid on any open flow — no-arg, `--pr`, `reload`) starts/loads as usual but
  **skips auto-opening the browser tab**, printing the ready URL instead.
- The first invocation starts a **background daemon** that serves the web UI. Subsequent
  invocations **attach to the running daemon**. One daemon serves **multiple PRs concurrently**,
  switchable within the UI (§4a).
- On **cold start, a development checkout rebuilds the web UI** (the build toolchain is present),
  so it always serves the current interface (source changes since the last build are picked up).
  This adds ~1–2s to a cold start; attaching to an already-running daemon does **not** rebuild —
  to pick up new UI changes, `mergie reload`. A failed build does not block startup: the daemon
  still serves the previous build.
- A **published install ships a prebuilt UI** (`dist/web`, produced at package time) and omits the
  build toolchain, so cold start **skips the rebuild** and serves the bundled UI directly — startup
  is immediate and no build tools are required on the user's machine.
- Unless `--no-open` is given, an open flow **auto-opens a browser tab** (the home picker for the
  no-arg/`reload` flows, or the PR for `--pr`). The **tab title reflects the PR** when one is
  selected (`org/repo #number — title`). The browser tab shows a **favicon**: a small diff —
  a green added line (`+`) and a red removed line (`−`) — on a white tile.
- `mergie stop` stops the daemon; `mergie status` reports whether it's running and which PRs are
  loaded. Stopping **waits for any in-flight AI work** (a chat turn or review) to finish and persist
  before exiting (up to a 2-minute grace), so a running review is not lost.
- `mergie version` (also `-v` / `--version`) prints the installed version as `mergie <x.y.z>`.
  `mergie help` (also `-h` / `--help`) prints the full usage — a one-line summary per command plus
  the global flags — and `mergie help <command>` prints details for one command (e.g.
  `mergie help stop`). Both **print and exit 0** without touching the daemon or running the startup
  checks. When `-h`/`--help` or `-v`/`--version` appears **anywhere** on the line it **wins over
  the rest** (help beats version if both are present); a command named alongside `--help` (e.g.
  `mergie stop --help`) shows that command's help.
- Parse errors point at help: an unknown command or an unknown `help <command>` target says to run
  `mergie help`; a command-specific mistake (missing `--pr` value, `--no-open` on `stop`/`status`)
  points to `mergie help <command>`.
- The daemon binds port **4517** by default; setting **`MERGIE_PORT`** overrides it. Combined with
  `XDG_DATA_HOME` (see §4), this lets a **second, isolated instance** (e.g. a dev build) run
  alongside the primary daemon without sharing its port or data.
- **Source-run guard.** Running mergie directly from a source checkout (a bare `src/main.ts`)
  would land on the default port + real data dir and clash with the installed daily-driver
  instance. So a bare run **refuses to start** and points to the isolated dev launcher instead.
  The guard fires only from a source checkout (detected by a `.git` entry at the repo root — never
  present in the published package or a `bunx` cache); it is bypassed by `MERGIE_DEV=1` (which the
  dev launcher sets) or `MERGIE_FORCE=1` (a manual override).

### Startup checks

mergie verifies its environment before doing work, so a misconfigured machine fails with clear
guidance instead of a cryptic error midway.

- **Runtime launcher.** The installed `mergie` command is a small launcher that runs under the
  package manager's shim (node for npm/pnpm, bun for `bunx`/`bun install -g`). If **Bun is not on
  PATH**, it prints install guidance (`https://bun.sh`) and exits — instead of the raw
  `env: bun: not found` you'd otherwise get when installed via a non-bun package manager. When Bun
  is present it hands off to the real program.
- **Hard checks** run on the open flows (no-arg, `--pr`, `reload`) — the ones that need GitHub —
  and **abort the command with next steps** if any fails:
  - **Bun version** is at least the supported minimum (currently 1.2); older prints an upgrade hint.
  - **`gh` is installed** (used for the GitHub API and cloning); if missing, points to
    `https://cli.github.com` and `gh auth login`.
  - **`gh` is authenticated** (`gh auth status`); if not, points to `gh auth login`.
  - `mergie stop` / `mergie status` are **exempt** — they only control an already-running daemon.
- **Soft checks** run after the daemon is up, on every open flow, and **warn (never block)** for
  each missing optional tool, naming the feature that won't work and how to install it:
  - **`rg`** (ripgrep) — General text/regex search.
  - **`sem`** — Symbol definition/usages lookups.
  - **`claude`** — AI review & chat.

## 2. Authentication

- Reuse the existing `gh` CLI login for **everything** — API *and* cloning — so `gh auth login` is
  the only setup required (no SSH key or host-key trust).
- **Cloning/fetching go over HTTPS** on the PR's own host, authenticated by the **gh credential
  helper** (`git -c credential.helper='!gh auth git-credential' …`, injected per-command so the
  user's global git config is untouched). This honours **GitHub Enterprise** hosts and needs no SSH
  setup. (Clones created before this — with an SSH `origin` — keep fetching over SSH; only new
  clones use HTTPS.)
- All GitHub API access (comment sync, posting, editing, deleting) goes through the **`gh` CLI**
  (`gh api`), using its token (which has `repo` scope). No separate token, no Octokit dependency.

## 3. Repository clones

- For each PR, maintain **one reusable clone** that contains both branches involved in the PR.
- The clone is **fetched, never re-cloned from scratch**, to pick up new commits — this happens via
  the **Refresh PR** action (see §5). Re-running `mergie --pr` for an already-loaded PR simply
  **re-attaches** (and opens a tab); it does **not** itself re-fetch.
- The clone is disposable and lives in a temporary location; all durable state (below) lives
  outside it.

## 4. Persistence & config

- **Data store:** `$XDG_DATA_HOME/mergie/pr_<org>_<repo>_<pr>/` (e.g.
  `~/.config/mergie/pr_withastro_astro_17360/` when `XDG_DATA_HOME=~/.config`). Contains one
  **SQLite** database and an **artifacts** folder per PR. It lives outside the clone so it
  survives clone cleanup and re-clones.
- Persisted data: per-hunk viewed state, comments, reviewed commit-ranges, AI review results,
  AI chat sessions, generated artifacts. On restarting `mergie` for the same PR, all of this is
  restored.
- **Config file:** a single, **optional** user config file at `$XDG_CONFIG_HOME/mergie/config.toml`
  (TOML). mergie **does not create it** — when it is absent, the built-in defaults apply. When
  present it holds:
  - lock-file / generated-file glob patterns (**extend** the built-in default set),
  - the selectable Claude model list (**replaces** the default list),
  - AI-review prompt templates (**replaces** the default templates),
  - `largeDiffThreshold` — the changed-line count at or above which a hunk collapses behind a
    "Load diff" button (integer; **default 500**; `0` disables collapsing). See §6.

## 4a. Home & PR selection

- The **home picker** is what mergie shows when no PR is selected (the no-argument / `reload`
  flow, or navigating with no `?pr=`). It has three parts, top to bottom:
  1. **Custom URL** — paste any GitHub pull-request URL and open it. The URL is validated (same
     tolerant parsing as the CLI); an invalid URL shows an inline hint rather than navigating.
  2. **Text filter** — narrows every list below by repo, owner, `owner/repo`, title, author, or
     `#number` (case-insensitive).
  3. **The lists** — **Recently reviewed** first (the PRs already loaded in the daemon), then
     **From GitHub**: the viewer's **open** PRs — those they **created**, are **assigned to**, or
     have a **review requested** from them. Each GitHub row is tagged with the relationship(s) and
     a **Draft** badge where applicable, and shows the author. A PR already under "Recently
     reviewed" is not repeated in the GitHub list.
- **Per-row metadata.** Every row shows the **author's avatar**, the PR **title**, `owner/repo`
  `#number`, and a secondary line of at-a-glance stats:
  - **Recently reviewed** rows (all data is already in hand from loading the PR, so it's free):
    a **status badge** (**Open** / **Merged** / **Closed**), the **branch** (`base ← head`),
    **commit count**, **diff size** (`+adds −dels · N files`), **"updated X ago"**, and **review
    progress** as **viewed / total hunks across the whole PR** (baseline → head). Progress is
    computed on demand and shows a brief **skeleton** while the whole-PR diff is prepared, then
    updates live as hunks are marked viewed.
  - **From GitHub** rows: the **author**, **"updated X ago"** and **"opened X ago"**, and the
    **diff size**, which is **enriched asynchronously** (one batched GitHub call for the whole
    list) — a **skeleton** shows in its place until it arrives. These rows carry **no status
    badge**: the GitHub list is open-only, so every one of them is open.
- **Recently reviewed is ordered most-recently-opened first.** Opening or switching to a PR stamps
  it as most-recent, so the list reflects where you were last working.
- **Status is re-checked whenever the picker opens.** Each time the picker is shown (home screen or
  the Switch-PR overlay), mergie re-queries the live open/merged/closed state of every loaded PR in
  one batched GitHub call and updates the badges, so a PR that has since merged or closed is caught
  without a manual refresh. The refreshed state is remembered, so the review header reflects it too.
- The GitHub list is built from three `gh search prs` queries (author / assignee / review-requested,
  open only), merged and deduped by PR URL, newest-updated first. It is **fetched once and cached
  for the session**; a **Refresh** button re-queries GitHub on demand. If GitHub can't be reached,
  the section shows the error (the rest of the picker still works). Diff sizes for these rows come
  from a separate batched GraphQL call; PRs the viewer can't see are simply left without a size.
- **Picking a PR navigates instantly to a loading view** that covers both fetching the PR metadata
  from GitHub and preparing the diff; on success it lands in the review screen. A failure to load
  is shown there with a way back to the picker. Picking an already-loaded PR skips straight to
  review.
- **Switching PRs mid-review:** the review header has a **Switch PR** button that opens the same
  picker in an overlay (the current PR is marked and not clickable). Selecting another PR — by URL
  or from the lists — navigates to it.

## 5. Commit ranges

- The review is always scoped to a **commit range**: a **start** (baseline, whose own changes
  are **excluded**) and an **end**. The diff shown is `start → end`.
- **"base branch"** / **"head branch"** throughout this document mean the **start** and **end**
  commits of the *selected range* — not the PR's base/head branches — unless stated otherwise.
- **Endpoints:** the **end** may be any commit in the PR. The **start** may be any PR commit or a
  special **"before-PR" baseline** (the merge-base with the target branch), enabling review of
  the whole PR or any sub-range.
- **Range selector UI:** a summary **pill** in the header shows a **coverage label** — "All N
  commits" when the selection spans the whole PR, otherwise "K of N commits" — followed by the
  **newest selected commit's subject** (truncated). The **SHA range** (`start → end`, plus the
  newest subject) is shown on **hover** (title), not on the pill face. Clicking the pill opens a
  **popup** with a visual commit rail (selection applies **live** as you pick commits), a caption
  describing the range in human terms (**both endpoint subjects + author + date + short SHAs**, and
  whether the diff starts from the beginning of the PR or after a given commit), the mark/​un-mark
  reviewed control, the reviewed count, and the list of reviewed ranges. The popup **closes on
  outside-click or Esc** (there is no "Done" button), keeping the current selection.
- **Default range** when a PR first opens: **last-reviewed → head**. If no range has been marked
  reviewed yet, default to the **entire PR** (before-PR baseline → head).
- **Refreshing:** a **"Refresh PR"** action in the review header re-fetches the PR's metadata and
  git objects from GitHub, so **new commits pushed after the PR was opened** appear (the range
  selector picks them up, and the default range extends to the new head).
- **Marking reviewed:** selecting a range does **not** save anything. A dedicated **"mark range
  reviewed"** button records the range. Reviewed ranges are keyed by commit SHA and are listable.
  Marking a range reviewed is **independent** of per-hunk viewed state (it does not change it).
  If the currently selected range is **already** recorded, the control shows a **"✓ Range
  reviewed"** state instead of the button — re-marking an existing range is a no-op, so the status
  is surfaced rather than leaving the button looking unresponsive. Clicking **"✓ Range reviewed"**
  **un-marks** the range (removes the record); the control then reverts to "mark range reviewed".
- **Force-push handling:** reviewed-ranges and AI reviews are keyed by SHA. If a force-push/rebase
  removes a referenced commit, that record is shown as **stale/unavailable** (best-effort; no
  re-anchoring). Hunk view-state and comments are unaffected because they are content-hash based.

## 6. Diff view

- **PR identity in the header:** alongside the PR title, the review header carries a single
  PR-level link:
  - A **status badge** (**Open** / **Merged** / **Closed**) sits next to the `owner/repo #number`
    heading, so the PR's live state is visible while reviewing. It reflects the state captured when
    the PR was loaded, refreshed by **Refresh PR** and by the picker's status re-check (see §4).
  - **"Open on GitHub ↗"** — a link to the PR's GitHub page (its conversation/overview,
    `https://github.com/{owner}/{repo}/pull/{number}`) that opens in a **new browser tab**.
  - Beside it, a **copy-icon button** copies that same PR URL to the clipboard (icon-only, with a
    tooltip; briefly shows a check on click to confirm).
  - **Branch line:** below the PR title, the **base ← head** branches are shown
    (e.g. `main ← feature/x`), each branch name followed by its own **copy-icon button** that
    copies just that branch name.
  - The header also keeps the **Refresh PR**, **Fetch GitHub comments**, and **AI review** (run)
    actions plus the AI-review progress indicator and the commit-range selector. It no longer
    carries a Comments toggle, an "AI reviews" navigation link, or a Description disclosure — those
    three surfaces now live in the **right icon rail** (below).
- **Right icon rail + expandable sidebar:** a thin vertical **icon rail is always visible, pinned
  to the right edge** of the review screen, with three icon buttons (top → bottom): **Comments**,
  **AI reviews**, and **PR description** (each icon-only, with a **near-instant tooltip** to its
  left on hover/focus + an `aria-label`). Clicking an icon
  **expands a sidebar to the left of the rail** showing that surface and **pushes the diff aside**
  (no overlay/backdrop, not a modal); the active icon shows a pressed/active state. Clicking the
  active icon again — or pressing **Esc** — **collapses** the sidebar. Only one surface shows at a
  time. The three surfaces stay **mounted** while the rail is in use, so each keeps its **own,
  independent scroll position and internal state** across tab switches and across collapse→reopen
  within a session.
  - **Comments** — the all-comments panel (see §7). The Comments icon carries a **miniature
    notification-style count badge** in its top-right corner showing the total comments on the PR;
    it uses the same total as the panel (so they always agree) and updates live as comments are
    added/deleted. When the count is **0 the badge is hidden** (icon only). The AI-reviews and
    PR-description icons have no badge.
  - **AI reviews** — the list of all AI reviews on the PR (see §10.2).
  - **PR description** — the PR body rendered as **GitHub-flavored markdown** in a scrollable
    panel; links open in a new tab. If the PR has no body it shows a muted "No description
    provided." The body is fetched from GitHub with the PR metadata and is kept current by
    **Refresh PR**.
- Layout: a **left sidebar** (holding the "View" switches, the file filter, and the **file list —
  flat or folder tree**, see below);
  **diffs** in the main area; the **right icon rail** pinned to the right edge.
- **Collapsible left sidebar:** a **chevron button at the top of the sidebar** collapses it to a
  **slim strip pinned at the left edge** holding just an **expand button**; the diff area widens to
  fill the reclaimed space. The width **animates**, the toggle is keyboard-operable with a tooltip
  ("Collapse sidebar" / "Expand sidebar") and `aria-expanded`, and the **collapsed/expanded state is
  a global layout preference persisted across reloads and navigation** (not per-PR). Collapsing does
  not lose the filter text or switch states; re-expanding shows them unchanged.
- **One card per hunk** (unlike GitHub's per-file card). The **hunk is the atom of work.**
- **Per-hunk actions:** each hunk header carries **"View file", "Ask AI", and "Comment on hunk"**
  as **icon-only** buttons; each shows its label in a **near-instant tooltip** on hover and on
  keyboard focus (appearing below the icon, fully visible — not clipped by the hunk card), and
  always exposes its label to assistive tech via `aria-label`. The **"Viewed"** checkbox stays
  as-is. (The file-heading "View file" / "Ask AI" actions remain text buttons.)
- **File heading:** beside each file's name in the diff, a **copy-icon button** copies the file's
  repo-relative path to the clipboard (icon-only, tooltip, check-on-click), sitting between the
  name and the "View file" / "Ask AI" actions.
- Each hunk has a **content hash** derived from the file it belongs to plus the hunk's contents,
  uniquely identifying it.
- **Syntax highlighting** on all rendered code (light theme).
- **Word-level change highlighting:** within a changed line, the **exact edited words** are
  shaded a deeper tint than the line background (deeper green on added lines, deeper red on
  deleted lines), so it's clear at a glance what actually changed — e.g. a version bump from
  `1.12.21` to `1.12.26` highlights only `21`/`26`, not the whole line. Applies to both the
  main diff and the split full-file view (§8). Whole-line insertions/deletions and **near-total
  rewrites** (a line where more than ~60% of it changed) show no word shading — the line background already
  conveys the change, and word shading there would just be noise. Unchanged context lines are
  never shaded. Base and head sides are highlighted independently (a word removed from the base
  line is shaded there even if nothing is added on the head line).
- **Viewed state:**
  - A hunk can be marked **viewed**; the state attaches to the **hunk hash**, so it persists
    across range changes whenever the hunk is unchanged.
  - A file auto-becomes **viewed** when all its hunks are viewed.
- **File handling:** **text** diffs — including added, deleted, and renamed files — are rendered
  inline. **Binary** files show a **placeholder** instead of content; files with **no textual
  changes** (e.g. a pure rename or mode change) show a short "no changes" note.
- **Large hunks collapse by default.** A hunk whose **changed lines** (additions + deletions,
  context excluded) reach the **`largeDiffThreshold`** (default **500**; §4) is **hidden behind a
  "Load diff" button** labelled with its changed-line count (e.g. "Large diff hidden — 1,240
  changed lines."), so one huge hunk doesn't slow the page or bury the rest of the review.
  Clicking **Load diff** renders it in place; jumping to a comment inside a large hunk loads it
  automatically. A collapsed large hunk **still counts** toward the review-progress ring — reaching
  "All reviewed" means loading and viewing it like any other hunk. `largeDiffThreshold = 0`
  disables collapsing entirely.
- **Toggles** control visibility of: viewed hunks, viewed files, lock/generated files, and
  whitespace-only changes (see below). They live under a **"View"** heading in the left sidebar as
  real, keyboard-operable **on/off switches**. To stay compact, the group **pins the two most-used
  filters** — **"Hide viewed files"** and **"Hide whitespace changes"** — as switches, and tucks
  **"Hide viewed hunks"** and **"Hide lock files"** into a **"More filters"** popover. The
  "More filters" row shows a **count badge** when any of the tucked-away filters are active, so a
  hidden active filter is never a surprise; the popover closes on outside-click or Esc. Lock files
  are identified by a **built-in pattern list, extensible via config.** All toggle state is
  **remembered per PR** — it survives browser restarts.
- **Hide whitespace-only changes:** the pinned **"Hide whitespace changes"** switch, when on,
  **re-diffs the range ignoring whitespace** (equivalent to GitHub's "Hide whitespace"). A line
  whose only change is indentation/spacing stops showing as changed, and a hunk that was purely
  whitespace **disappears entirely**. It applies to **both the main diff and the split full-file
  view** (§8), and is **remembered per PR** (default off). Because git re-decomposes the diff, the
  two modes have **independent viewed-progress** — a hunk marked viewed with whitespace shown is a
  different hunk (different content hash) from its whitespace-hidden counterpart, so viewed marks do
  **not** carry between modes. Turning the toggle off **restores the original marks unchanged**
  (nothing is lost on a round-trip). The switch carries a **tooltip** explaining this so hunks
  reappearing as un-viewed after toggling isn't surprising.
- **Review-progress ring:** the left sidebar's top row **replaces the old "View" heading** with a
  **circular ring gauge** whose fill grows as you review, wrapping the count of hunks still **left**
  (e.g. a ring around **"4"** with the caption **"hunks left"**); the collapse chevron stays on the
  right. The ring's fill = viewed hunks ÷ **all** hunks in the **currently-selected commit range**
  (lock/generated files included, and **independent of the visibility toggles** — hiding viewed
  hunks does not change it). As hunks are marked viewed the ring fills and the number counts down,
  **updating live**; at **zero left** the ring turns **green with a check** and reads **"All
  reviewed"**. Only the per-hunk viewed marks feed it; marking a **commit range reviewed**
  (§ range selector) is a separate concept and does not fill it. When the range has no hunks the row
  falls back to the plain **"View"** label; the ring is hidden when the sidebar is collapsed. There
  is deliberately **no progress indicator on the PR list.**
- **File list, two views.** The left sidebar's file list can switch between a **flat list**
  (every changed file as one row showing its full repo-relative path) and a **folder tree**. A
  small **List / Tree segmented control** sits directly under the filter box. The **tree is
  GitHub-style:** folders are **collapsible** (click to expand/collapse), and a chain of
  **single-child folders is compressed into one row** (e.g. `src/web/components` shows as a single
  entry rather than three nested levels). Folders are sorted before files, each group
  alphabetically. The **view choice is a global preference remembered across reloads and
  navigation** (not per-PR); **tree is the default** on a fresh install.
- **File search over file names is fuzzy and affects only the sidebar list — never the diff.**
  Typing in **"Filter files…"** narrows the file list to matches (ranked by match quality) so you
  can jump to a file quickly, but the **main diff area keeps showing every file** in the current
  range (still subject to the visibility toggles, which do apply to both). Clearing the filter
  restores the full list. In **tree view an active filter prunes the tree** to matching files and
  **auto-expands** every folder so the matches are visible; you can **still collapse folders while
  filtering** (those collapses are transient — discarded when the search changes or clears).
  Clearing the filter returns to the tree with its previous, pre-search expand/collapse state.
- **Every text box** in the UI (comments, chat, review output, etc.) has a **copy button**; it
  briefly confirms with a **"Copied!"** label after a click so the otherwise-silent clipboard
  write is visible.
- **Markdown rendering** is supported (comments, chat, reviews).
- **Comment composer keyboard support:** every comment/reply/edit composer submits on
  **⌘/Ctrl+Enter** and cancels on **Esc** (plain Enter stays a newline). The placeholder states
  these shortcuts.

## 7. Comments

- A comment may target a **whole hunk** or a **range of lines**, on **either side** (head or base
  version of the range).
- **Anchoring:** a comment is anchored by a **strict content hash** of the file path + the exact
  commented line text (and side). It is shown only when that exact block is present in the
  selected range; otherwise it is hidden. (Example: comment made while viewing range A→B on lines
  that still exist unchanged in range B→D remains visible in B→D; if those lines changed, it is
  hidden.)
- Comments are **persisted** locally and restored across restarts.
- **CRUD:** local comments can be created, edited, and deleted. Editing/deleting a comment that
  was already posted to GitHub also updates/deletes it on GitHub (delete requires confirmation).
  Deleting a posted comment also **evicts any cached synced-thread copy immediately**, so it does
  not linger as a phantom "from GitHub" entry until the next fetch.
- **Draft vs posted indicator:** in the diff view each comment shows a small origin badge —
  **"local draft"** (not yet on GitHub) or **"posted to GitHub"** — so the two are
  distinguishable at a glance, matching the All-comments view's badges.
- **Posting to GitHub:** after creating a comment locally, there is an option to post it. Posting
  happens **immediately as a single inline comment** (not batched into a pending review).
  - A **whole-hunk** comment posts as a GitHub **multi-line comment** spanning the hunk's changed
    lines.
  - Before posting, a **preview** lets the user choose the target: the **range's end commit**
    (labelled "Reviewed commit" — pins to exactly what was viewed) or the **PR head** (labelled
    "Latest PR head" — relocated to be "live"). Each choice explains itself on hover; a
    "Checking target…" note shows while the target is being resolved. If the exact line no longer
    exists at the chosen target, warn and let the user adjust.
- **GitHub sync (inbound):** a **"Fetch GitHub comments"** action (in the review header and the
  all-comments view) pulls **inline diff comments and their reply threads** into a local cache. They are shown
  against the matching hunk/line-range when the selected range contains that line (matched by side
  + line number); threads whose anchor line is not in the current range are hidden. Reply threads
  are rendered, and the user can **reply** to a thread (not only create new comments). Top-level PR
  conversation comments and review summary bodies are **out of scope.**
  - **De-duplication:** once a comment posted from mergie is synced back, it is shown **only as the
    synced thread** (so replies to it appear), not also as the standalone local comment. Un-synced
    or un-posted local comments continue to render as editable local comments.
  - **A posted comment is a GitHub comment (GitHub is the source of truth).** Once a mergie comment
    is posted to GitHub it is **no longer a local draft**. On every fetch, each posted comment is
    **reconciled** against GitHub: its body is **updated from the GitHub copy** (so GitHub-side
    edits win), and if it **no longer exists on GitHub** (deleted there) it is **removed from
    mergie** — it does **not** reappear as an editable local comment. It always shows exactly once
    (deduped by GitHub id).
- **"All comments" side panel:** the review screen shows all comments in the **Comments tab of the
  right icon rail** — there is **no separate all-comments page**. It is opened/closed by the
  **Comments icon in the rail** (see §6), whose miniature badge carries a **live count** of the
  total comments on the PR; this count is the panel's own total, so the two always match, and it
  updates as comments are added/deleted (the badge is hidden at 0). When open, the **diff area
  shrinks to make room** and both are fully visible and interactive side-by-side (**no
  overlay/backdrop, not a modal**). The panel is closed by the rail's close control, by clicking
  the active Comments icon again, or by **Esc** (Esc first dismisses the out-of-range confirmation
  below if it is showing).
  The panel lists **every comment on the PR**, merging local comments with the fetched GitHub
  inline threads into one deduplicated list. Comments are either **local drafts** (never posted)
  or **GitHub comments** (anything that lives on GitHub — whether posted from mergie or authored
  directly on GitHub). The categories:
  - **local drafts** — made in mergie, not yet posted;
  - **posted to GitHub** — made in mergie and posted (a GitHub comment, not a local draft);
  - **from GitHub (yours)** — made by the user directly on GitHub and fetched in;
  - **from GitHub (others')** — made by other people and fetched in.
  A comment authored in mergie, posted, and then fetched back appears **once** (deduped by GitHub
  id, matching the diff view), tagged as posted and carrying its thread's reply count. Each row
  shows its file + location, author (**You** or the GitHub login), an origin badge, reply count,
  and timestamp, with:
  - **Click-to-locate:** clicking a comment row **scrolls the diff to that comment and briefly
    highlights it**, **without changing the selected range**. Three cases:
    - **Already on screen** → just scroll + highlight.
    - **In the current range but hidden** (its hunk is hidden by a view toggle such as "hide
      viewed hunks", or it's inside an auto-collapsed viewed hunk) → **auto-reveal just that one
      hunk** and expand it, then scroll + highlight. The reveal is a **transient, view-only
      override**: it does **not** flip the "hide viewed" toggle, does **not** change any hunk's
      viewed status, and does **not** change the range. Only the target hunk becomes visible;
      other hidden hunks stay hidden. As soon as the user changes the range or their view toggles
      (or reloads), normal visibility rules reapply and that hunk hides again.
    - **In a different range** (its anchor isn't in the current range's diff at all) → mergie does
      **not** change the range; instead it shows a **small confirmation** offering to **open the
      comment's own range in a new browser tab** (the current review is left undisturbed) or to
      cancel. GitHub-only comments (no local anchor) offer their **GitHub link** instead.
  - actions scoped to the category: **Post** only for local drafts; **Edit** and **Delete** for
    **any comment the user authored** — local drafts, comments posted from mergie, and comments the
    user wrote directly on GitHub (fetched in). Editing a GitHub comment updates it **on GitHub**
    (GitHub is the source of truth); deleting removes it on GitHub too (with a confirm). **Copy** is
    available on all. **Other people's GitHub comments are strictly read-only** — no Edit/Delete —
    enforced on the server by comparing the comment's author login to the viewer's `gh` login, not
    just hidden in the UI.
  - The panel stays **in sync with the diff live**: comments added, edited, deleted, posted, or
    synced from the diff update the panel immediately, and vice-versa.
  - **Fetch GitHub comments** is available in the panel (as in the review header).
  - **filters:** by **author** (everyone / me / others), by **source** (local drafts vs. on
    GitHub — posted comments count as "on GitHub", not local), and **by file.** A count reads
    **"N comments"** with no filter active and **"M of N comments"** when a filter narrows the
    list.
  - **states:** while loading it says "Loading comments…"; with no comments at all it invites the
    user to add one or fetch from GitHub; with comments present but none matching the active
    filters it says "No comments match these filters." (distinct messages, so an empty PR is never
    confused with an over-filtered list).

## 8. File navigator (full-file view + drill-down)

Opening a file (from a hunk's or file's **View file**, or a search/symbol result) opens the
**file navigator** — a modal with a **Back/Forward history** of frames. A frame is one of:

- a **diff frame** — the **full file** in a **split view**: base (start) and head (end) side by
  side, scrolling **synchronously**, showing the diff as GitHub's split view would with all
  folded/context lines expanded. Opened from a hunk it **centers on the first actual change** at
  or below the opened position and briefly **flashes a highlight** that fades after ~1s (falling
  back to the opened line if there is no change below). A file with **no base** (added) or **no
  head** (deleted) shows a **centered placeholder** for the missing side instead of a blank column.
- a **file frame** — a **single version** of a file at one commit, centered and briefly
  highlighted on a target line (used when opening a definition/usage/search result).
- a **results frame** — a search/symbol result list (see §9), reusing the same list UI.

Navigation: **double-clicking a symbol inside any diff/file frame** runs a lookup and **pushes a
new frame** (Usages/Search and multi-result Definition push a results frame; an **unscoped**
single-result Definition jumps straight to a file frame, while a **scoped** single-result
Definition stays a results frame so its scope indicator + "search everywhere" control remain
reachable — see §9). Opening a hit from a results frame pushes a file frame. **Back/Forward** walk
the history, so you can drill in and return to exactly where you were — including back to the
original file from a results frame. Returning to a frame **restores the exact scroll position** you
left it at (visited frames stay live, so nothing re-centers or jumps to the top). The header shows
a breadcrumb of the current frame; **Esc** closes the whole navigator (it never collapses the rail
behind it).

## 9. Symbol navigation & search

Two entry points, one unified result surface.

- **Double-click a word** (or drag-select an identifier) in the diff or any navigator frame → a
  small floating menu offers **Definition**, **Usages**, and **Search**, plus a **head/base**
  toggle. The toggle **defaults to the version the symbol was selected in**: a symbol picked in the
  **before/deleted** side defaults to **base**, one in the **after/added** side (or a context line)
  defaults to **head** — and it stays overridable. Definition/Usages are scope-aware: the **file
  the symbol was clicked in** scopes the lookup, so you get the definition(s) relevant to where you
  clicked (falling back to a repo-wide lookup when the symbol isn't defined in that file, e.g. a
  cross-file reference). Definition & Usages use **`sem`**; Search uses **`rg`**.
- **The rail "Search" tab** — a persistent search surface in the right icon rail:
  - **General** search (`rg`): literal + case-insensitive by default, with **case-sensitive** and
    **regex** toggles (an invalid regex shows an error).
  - **Symbol** search (`sem`): type an exact name and choose **Definition** or **Usages**.
  - a **head/base** toggle (default head).
  - every mode/action/side pill carries a **hover tooltip** explaining what it does.
  - the **Run** button is **disabled while the shown results already match the current inputs** and
    **re-enables** the moment the query, mode, or a pill changes. The **results heading stays frozen
    on the last run** — editing the inputs never changes it until Run is pressed.
- **Results** (same list for the rail and the navigator's results frames):
  - each result is a **syntax-highlighted code preview** — a **Definition** shows its **full
    body**; a **Usage** shows the **real reference line** (the actual use site, not the enclosing
    entity's declaration) with a few lines of context; a **Search** hit shows the match with
    context. The matched line is emphasized and each result is labelled with its **scope** (the
    enclosing entity). Results at the same file+line are **deduped** with their scopes combined.
  - **Definition lists every matching definition**, not just one — a name defined in several
    places (e.g. a method present in multiple classes) shows all of them, each with its scope and
    file. When scoped to a clicked file, only that file's definition(s) are shown.
  - when a lookup is **scoped to a file**, the heading shows an **"in &lt;file&gt;" chip** with a
    **"Search everywhere"** action that re-runs the same lookup repo-wide (e.g. jump from one
    class's definition to all definitions).
  - **Usages** results carry an always-visible caveat — "*Usages are best-effort — some references
    may be missing*" — with an **info icon** whose tooltip explains that re-exports, dynamic calls,
    and cross-file references can be missed.
  - a **total count** and, when filters hide some, "**showing X of Y**".
  - **filters**: file-path text, matched-code text, and an **exclude tests/generated** toggle.
  - **keyboard**: ↑/↓ move, Enter opens the focused result, Esc closes.
  - **View file** opens the result in the **file navigator** (§8), centered and highlighted.
- Running a lookup from the diff shows results in the **rail Search tab**; running one from inside
  the navigator pushes a **results frame** there (self-contained drill-down).

> Note: `sem` has no cross-file *reference binding* — it can't tell which specific definition a
> given call site refers to. So a Definition lookup lists **all** definitions of the name (scoped
> to the clicked file when triggered from one); you pick the relevant one.

## 10. AI features

Powered by the **Claude Agent SDK using the user's Claude Max login** (no API key / metered
billing). A **model picker** (choices come from the config model list) is available for chat and
reviews.

### 10.1 AI chat
- Started from a **hunk** or a **file**, shown in a **dockable side panel.**
- Supports **multiple sessions per hunk**; all sessions are **listable.** A session's title is
  **derived from its opening prompt** (truncated) so sessions are distinguishable at a glance.
- The AI has **full agentic access to the clone**, including both the base and head versions.
- **Live feedback while the agent works:** the reply **streams in token by token**; while the
  agent is using tools (reading files, running commands, searching) the panel shows a **spinner
  with a plain-language activity note** (e.g. "Reading src/app.ts", "Running: git diff …") and an
  **elapsed-time counter**, so a long turn never looks frozen. The transcript **auto-scrolls** to
  keep the latest content in view, and each message shows a **timestamp**.
- **Artifacts** the AI generates (e.g. an HTML explainer of the PR) are saved to a dedicated
  folder **linked to the current commit range**, and are **browsable across all ranges.**
- Markdown is rendered; every message has a copy button.

### 10.2 AI review (trailing feature)
- A dedicated button triggers an AI review of the **currently selected commit range.**
- First it offers an **optional prompt** to focus the review, a choice of **template**, and a
  **model**.
- **Templates** are defined in the config file; adding a new one is easy. Starter templates:
  - list the **key decisions** made in the changes (which the AI can then reduce/summarise),
  - an **adversarial pass** for bugs and obvious performance issues.
- The result is **linked to the reviewed commit range** — it is only visible while that range is
  selected. The **AI reviews tab of the right icon rail** (see §6) **lists all review results** on
  the PR, each with the range it covers and a link to open it **with the correct range selected in
  a new tab**; ranges whose commits no longer exist (after a force-push/rebase) are flagged as
  stale and cannot be opened. There is **no separate all-reviews page**.
- **Background execution + progress indicator:** running a review does **not** block the popup —
  the run continues in the daemon and its result is persisted even if the popup is closed. A
  **persistent app-level indicator in the review header** reflects an in-progress review for this
  PR (with the commit range and a count if several run), visible after closing the popup and while
  on other ranges/screens of the same PR. When a review **finishes**, the indicator shows a
  clickable **"AI review ready"** state that **opens the AI-review popup on that range with the new
  review expanded**; a run that errors shows a clickable **"AI review failed"** state. Reopening
  the popup while a run is in progress shows the **running state** rather than a blank form. The
  completion / failure notice is **dismissed** once the user clicks through to it.

---

## 11. Technical

- **Runtime/language:** **Bun** + **TypeScript** throughout. Use Bun built-ins: `bun:sqlite`,
  `bun test`, `Bun.serve` (HTTP + WebSocket), native TOML import for config.
- **Web UI:** **React 19 + Vite.**
- **Client/server API:** **tRPC v11** (end-to-end typed procedures, no REST), input validation
  with **zod v4**. The daemon serves the tRPC router over `Bun.serve` (fetch adapter); the React
  UI consumes it via `@trpc/react-query` + `@tanstack/react-query`. Streaming (AI) uses a
  WebSocket/subscription channel.
- **Persistence:** raw SQL over `bun:sqlite` with a thin, typed repository helper (no ORM).
- **Syntax highlighting:** highlight.js.
- **External tools (invoked as subprocesses,** targeting the correct branch checkout via `-C` /
  `--cwd`): **required** — `git` (clone/fetch/diff), `gh` (GitHub API); **optional, for the search
  rail only** — `sem` (Symbol definition/usages) and `rg` (General word/regex search). When a
  search tool is absent, mergie still runs; only that search feature is unavailable (its request
  errors), so `git`/`gh` are hard requirements and `sem`/`rg` are not.
- **Development method:** strict **test-first, red-green (TDD)** — write a failing test, confirm
  it fails for the right reason, write the minimum code to pass, then refactor green.
- **Testing layers:**
  - Domain / server logic: unit tests under `bun test`.
  - **Complete UI: end-to-end tests driven by `playwright-cli` in headless mode** (default; do not
    pass `--headed`), always with `--browser=chromium`. Cover the full user-facing surface —
    diff review, comments, ranges, symbol panel, full-file view, and the AI panels.
- **Dependency policy:** every third-party dependency is **pinned to an exact version that is at
  least one month old** at the time of installation (avoid brand-new releases to reduce exposure
  to freshly introduced security issues). Adding any new dependency requires explicit user
  approval first.
- **Delivery:** built essentially complete before real use, with **AI review + templates** as the
  last feature to land.
