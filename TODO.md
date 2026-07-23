# mergie — TODO

Backlog of ideas and known gaps not yet scheduled. Product-level notes; see
[`SPEC.md`](./SPEC.md) for locked behaviour.

## Medium priority

- **A PR's repo can be cloned several times at once on first open.** Opening a not-yet-cloned PR
  fires off the clone the first time any operation needs it, but several such operations run at
  once on page load (the range selector, the default-range resolution, and the diff itself). None
  of them wait for the others, so each starts its **own** full clone/fetch of the same repository
  in parallel. On a small repo this is barely noticeable; on a large one (e.g. a monorepo with ~1M
  git objects) it thrashes disk and network and the first open drags on far longer than a single
  clone would. Fix idea: remember the in-flight clone as a shared promise so concurrent callers all
  await the one clone instead of starting duplicates.
- **The center diff redraws more than it needs to.** Every diff card (and its syntax highlighting)
  is re-rendered whenever the review screen re-renders — e.g. flipping a view filter, changing the
  commit range, or any small state change — even for cards whose content didn't change. On large
  PRs this shows up as a brief stutter. The file-filter case was fixed by making the filter text
  local to the sidebar (so typing no longer touches the diff); the remaining, broader fix is to let
  each diff card skip re-rendering when its own data is unchanged (memoize the file sections / hunk
  cards and give them stable inputs). Bigger, higher-risk change; do it when diff responsiveness on
  large PRs becomes a priority.
- **Cancel / stop a running AI chat turn.** A turn now shows live activity + elapsed time, but
  there is still no way to stop one that is taking too long or has gone off-track — you must wait
  for it to finish. This needs server-side cancellation of the agent run (aborting the SDK query
  and closing the stream), not just closing the socket client-side (which would leave the turn
  running and persisting on the server). Add a "Stop" control in the chat panel once that exists.
- **AI agent wanders outside the PR clone.** When chatting about a hunk in a large/opaque file
  (e.g. a lock file), the agent sometimes `cd`s out of its checkout and explores unrelated
  directories, making turns long and noisy. Consider tightening the agent's working scope or
  system prompt so it stays within the PR's base/head checkouts.

## Low priority

- **"Recently reviewed" is session-only.** The home picker's "Recently reviewed" section lists the
  PRs currently loaded in the daemon, so after a daemon restart (`mergie reload`, or a machine
  restart) it starts empty until a PR is reloaded — even though each PR's own data (comments,
  viewed state, ranges) is persisted on disk. Consider persisting a small "recently opened" list
  (PR id + repo/#number/title + last-opened time) so the section survives restarts, most-recent
  first, independent of what the in-memory registry happens to hold.
- **Post button gives no in-flight feedback for the actual post.** The Post-to-GitHub menu shows
  "Checking target…" while it resolves the target line (a GitHub round-trip), but the subsequent
  post itself is fire-and-forget from the menu's point of view — the menu closes and the only
  signal that the post landed is the comment's "on GitHub" link appearing a moment later, with no
  explicit success confirmation. Consider threading the post mutation's pending/settled state into
  the button (a brief "Posting…" then "Posted ✓"), which needs the parent to pass a status down
  rather than a fire-and-forget `onPost`.
- **Reply composer has no posting/optimistic feedback.** Replying to a synced GitHub thread posts
  the reply then re-fetches the whole thread cache; during that round-trip there is no spinner or
  optimistic reply bubble, so a slow network looks like nothing happened. Consider a pending state
  or optimistic insert for replies (and for new line/hunk comment posts) similar to the chat
  panel's streaming affordance.

- **Edit/delete parity in the in-diff GitHub thread view.** The All-comments page lets you edit
  and delete GitHub comments you authored, but the inline thread view in the diff
  (`GithubThreadView`) still only offers Reply. Add an inline editor + delete (own comments only,
  same author check) there for consistency, so you don't have to switch to the All-comments page
  to manage a comment you're looking at in context.
- **Reviewing already-merged PRs.** When a PR has already been merged into its base
  branch **via a merge commit**, the review baseline (the "before-PR" point) collapses onto
  the PR head, so the diff comes out **empty**. Cause: the baseline is computed as
  `merge-base(base-branch, PR-head)`, and once the head is an ancestor of the base branch that
  merge-base equals the head itself. Squash- and rebase-merges are unaffected (the head is no
  longer in the base branch's ancestry). Fix idea: detect this case and fall back to a baseline
  derived from the PR's own commit history (e.g. the parent of the PR's first commit) instead of
  the live merge-base.
- **Reviewing PRs from forks (external contributors).** When a PR's head branch lives in a
  **fork** rather than the base repository (i.e. a cross-repository PR — typical for open-source
  contributions), the diff comes out **empty**: mergie clones the base repo and only has its
  branches, so the PR's head commit (which exists only in the fork) is never fetched, and the
  range has nothing to diff against. Same-repo PRs (head branch pushed to the base repo) are
  unaffected. Fix idea: fetch the PR head explicitly by its GitHub ref (`refs/pull/<n>/head`, which
  resolves regardless of which fork the head lives in) — or add the fork as a remote and fetch its
  head branch — so the head commit is present in the clone before diffing.
