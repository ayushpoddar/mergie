import type { CommentRow, CommentSide } from "@/db/repositories/comments.ts";
import type { GithubThread } from "./githubThreads.ts";

/**
 * Where a comment originates:
 * - `'local'` — authored in mergie, not (yet) posted to GitHub.
 * - `'posted'` — authored in mergie and posted to GitHub.
 * - `'github'` — authored on GitHub (by anyone) and fetched into mergie.
 */
export type CommentOrigin = "local" | "posted" | "github";

/**
 * A single comment row for the unified "All comments" view, merged from the
 * local comment store and the fetched GitHub inline-comment threads.
 */
export interface AllCommentEntry {
  /** Stable unique key: `local:<id>` or `gh:<githubId>`. */
  key: string;
  /** Where the comment came from. */
  origin: CommentOrigin;
  /** True when authored by the current user. */
  mine: boolean;
  /** Display author: "You" when mine, else the GitHub login. */
  author: string;
  /** Repo-relative file path (null if GitHub omitted it). */
  path: string | null;
  /** Diff side the comment anchors to (null if unknown). */
  side: CommentSide | null;
  /** Human location string, e.g. "whole hunk", "line 5", "lines 5–8". */
  location: string;
  /** Markdown body. */
  body: string;
  /** Creation time (Unix ms); null if unknown. */
  createdAt: number | null;
  /** Number of replies (GitHub threads); 0 for local/posted without a thread. */
  replyCount: number;
  /** Local comment id for post/delete actions; null for github-origin entries. */
  localId: number | null;
  /** Head SHA when the comment was made (for the in-context link); null for github-origin. */
  madeAtSha: string | null;
  /** URL of the comment on GitHub if it exists there; null otherwise. */
  githubUrl: string | null;
  /** GitHub comment id when the comment lives on GitHub (posted or fetched); null for local drafts. */
  githubId: string | null;
}

/** Human location string for a local comment. */
function localLocation(c: CommentRow): string {
  if (c.kind === "hunk") return "whole hunk";
  if (c.startLine === null || c.endLine === null) return "lines ?";
  return c.startLine === c.endLine ? `line ${c.startLine}` : `lines ${c.startLine}–${c.endLine}`;
}

/** Map a local comment row to a unified entry. */
function fromLocal(c: CommentRow, replyCount: number): AllCommentEntry {
  return {
    key: `local:${c.id}`,
    origin: c.githubId !== null ? "posted" : "local",
    mine: true,
    author: "You",
    path: c.path,
    side: c.side,
    location: localLocation(c),
    body: c.body,
    createdAt: c.createdAt,
    replyCount,
    localId: c.id,
    madeAtSha: c.madeAtSha,
    githubUrl: c.githubUrl,
    githubId: c.githubId,
  };
}

/** Map an un-matched GitHub thread (not authored in mergie) to a unified entry. */
function fromThread(t: GithubThread, viewer: string): AllCommentEntry {
  const mine: boolean = viewer.length > 0 && t.root.author === viewer;
  return {
    key: `gh:${t.root.githubId}`,
    origin: "github",
    mine,
    author: mine ? "You" : t.root.author,
    path: t.path,
    side: t.side,
    location: t.line === null ? "line ?" : `line ${t.line}`,
    body: t.root.body,
    createdAt: t.root.createdAt,
    replyCount: t.replies.length,
    localId: null,
    madeAtSha: null,
    githubUrl: t.root.htmlUrl,
    githubId: t.root.githubId,
  };
}

/**
 * Merge local comments and fetched GitHub threads into one unified list for the
 * "All comments" view. A mergie comment that was posted to GitHub and then
 * fetched back is shown once (as the local/posted entry, carrying its thread's
 * reply count) — matching the diff view's de-duplication by GitHub id. Result
 * is sorted newest-first by creation time.
 *
 * @param local   All locally-stored comments.
 * @param threads Grouped, fetched GitHub inline-comment threads (roots+replies).
 * @param viewer  The current user's GitHub login (empty string if unknown).
 */
export function mergeAllComments(local: CommentRow[], threads: GithubThread[], viewer: string): AllCommentEntry[] {
  const threadByRootId = new Map<string, GithubThread>(threads.map((t) => [t.root.githubId, t]));
  const postedIds = new Set<string>(local.map((c) => c.githubId).filter((id): id is string => id !== null));

  const entries: AllCommentEntry[] = [
    ...local.map((c) => fromLocal(c, c.githubId !== null ? (threadByRootId.get(c.githubId)?.replies.length ?? 0) : 0)),
    ...threads.filter((t) => !postedIds.has(t.root.githubId)).map((t) => fromThread(t, viewer)),
  ];

  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (b.e.createdAt ?? 0) - (a.e.createdAt ?? 0) || a.i - b.i)
    .map(({ e }) => e);
}
