import type { AllCommentEntry } from "@/daemon/allComments.ts";
import type { FileView } from "@/daemon/reviewService.ts";

/** DOM id for a rendered local (mergie) comment element. */
export function localCommentDomId(localId: number): string {
  return `comment-local-${localId}`;
}

/** DOM id for a rendered synced GitHub thread element. */
export function githubCommentDomId(githubId: string): string {
  return `comment-gh-${githubId}`;
}

/**
 * Ordered element ids to try scrolling to for an entry. A GitHub-backed comment
 * usually renders as its synced thread (`comment-gh-…`), but a just-posted one
 * that has not been fetched back yet still renders as a local element
 * (`comment-local-…`) — so posted entries list both, thread first.
 */
export function commentDomIdCandidates(entry: AllCommentEntry): string[] {
  const ids: string[] = [];
  if (entry.githubId !== null) ids.push(githubCommentDomId(entry.githubId));
  if (entry.localId !== null) ids.push(localCommentDomId(entry.localId));
  return ids;
}

/**
 * Whether an All-comments entry is actually rendered in the current diff range.
 *
 * A comment is "visible in the diff" only when the range view has anchored it to
 * a hunk — the same strict anchoring the diff uses (exact line/hunk present).
 * Local drafts and mergie-posted comments match by their local comment id;
 * GitHub-origin comments (and the posted comment's synced thread) match by the
 * thread's root GitHub id. If it matches nothing rendered, honoring a click on
 * it would require changing the range, so it is treated as out-of-range.
 *
 * Pure — reads only its arguments, mutates nothing.
 *
 * @param entry The unified comment entry the user clicked.
 * @param files The files/hunks currently rendered for the selected range.
 */
export function commentVisibleInDiff(entry: AllCommentEntry, files: FileView[]): boolean {
  return commentHunkHash(entry, files) !== null;
}

/**
 * The content hash of the hunk that anchors this comment within `files`, or
 * `null` if the comment is not anchored anywhere in them. Same matching as
 * {@link commentVisibleInDiff} (local id or synced-thread id). Pure.
 */
export function commentHunkHash(entry: AllCommentEntry, files: FileView[]): string | null {
  for (const file of files) {
    for (const hunk of file.hunks) {
      if (entry.localId !== null && hunk.comments.some((c) => c.id === entry.localId)) return hunk.hash;
      if (entry.githubId !== null && hunk.githubThreads.some((t) => t.root.githubId === entry.githubId)) return hunk.hash;
    }
  }
  return null;
}

/**
 * What clicking a comment row in the All-comments panel should do, given the
 * files for the whole selected range (`rangeFiles`) and the subset currently
 * rendered after view toggles (`renderedFiles`):
 * - `scroll` — it's already on screen; just scroll to it.
 * - `reveal` — it belongs to the current range but a view toggle (or an
 *   auto-collapsed viewed hunk) is hiding it; temporarily reveal that hunk,
 *   then scroll. Carries the hunk hash to reveal. The selected range is never
 *   changed.
 * - `out-of-range` — it isn't in the current range at all; honouring it would
 *   require changing the range, so the caller offers to open it in a new tab.
 *
 * Pure — reads only its arguments.
 */
export type CommentClickAction =
  | { kind: "scroll" }
  | { kind: "reveal"; hunkHash: string }
  | { kind: "out-of-range" };

/** Classify a comment-row click into a {@link CommentClickAction}. */
export function classifyCommentClick(
  entry: AllCommentEntry,
  rangeFiles: FileView[],
  renderedFiles: FileView[],
): CommentClickAction {
  if (commentVisibleInDiff(entry, renderedFiles)) return { kind: "scroll" };
  const hunkHash: string | null = commentHunkHash(entry, rangeFiles);
  if (hunkHash !== null) return { kind: "reveal", hunkHash };
  return { kind: "out-of-range" };
}
