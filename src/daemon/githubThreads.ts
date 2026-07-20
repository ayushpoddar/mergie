import type { DiffSide } from "@/domain/hash.ts";

/** A cached GitHub comment row enriched with its computed html URL. */
export interface GithubThreadRow {
  /** GitHub's stable comment id. */
  githubId: string;
  /** File path the comment is on (null if GitHub omitted it). */
  path: string | null;
  /** Raw side string from GitHub (`'LEFT'`/`'RIGHT'`). */
  side: string | null;
  /** Line number the comment anchors to (side-relative, 1-based). */
  line: number | null;
  /** Markdown body. */
  body: string;
  /** Author login (null if unknown). */
  author: string | null;
  /** Creation time as a Unix ms timestamp (null if unknown). */
  createdAt: number | null;
  /** Parent comment id if this is a reply; null for roots. */
  inReplyTo: string | null;
  /** Full URL to the comment on GitHub. */
  htmlUrl: string;
}

/** A single comment as presented within a thread. */
export interface ThreadComment {
  /** GitHub comment id. */
  githubId: string;
  /** Author login (empty string if unknown). */
  author: string;
  /** Markdown body. */
  body: string;
  /** Creation time (Unix ms) or null. */
  createdAt: number | null;
  /** Link to the comment on GitHub. */
  htmlUrl: string;
}

/** A GitHub inline comment thread: a root comment plus ordered replies. */
export interface GithubThread {
  /** File the thread is on. */
  path: string | null;
  /** Diff side the thread anchors to. */
  side: DiffSide;
  /** Side-relative line number the thread anchors to. */
  line: number | null;
  /** The root (non-reply) comment. */
  root: ThreadComment;
  /** Replies, oldest-first. */
  replies: ThreadComment[];
}

/** Normalise GitHub's side string to the typed union (defaulting to RIGHT). */
function toSide(side: string | null): DiffSide {
  return side === "LEFT" ? "LEFT" : "RIGHT";
}

/** Project a row to its thread-comment view. */
function toComment(r: GithubThreadRow): ThreadComment {
  return { githubId: r.githubId, author: r.author ?? "", body: r.body, createdAt: r.createdAt, htmlUrl: r.htmlUrl };
}

/**
 * Group flat GitHub inline comments into threads: each root (no `inReplyTo`)
 * gets its replies attached oldest-first. Replies whose parent is missing from
 * the set become their own single-comment threads so nothing is dropped.
 */
export function groupGithubThreads(rows: GithubThreadRow[]): GithubThread[] {
  const byId = new Map<string, GithubThreadRow>(rows.map((r) => [r.githubId, r]));
  const replies = new Map<string, GithubThreadRow[]>();
  const roots: GithubThreadRow[] = [];

  for (const r of rows) {
    if (r.inReplyTo !== null && byId.has(r.inReplyTo)) {
      const bucket = replies.get(r.inReplyTo) ?? [];
      bucket.push(r);
      replies.set(r.inReplyTo, bucket);
    } else {
      roots.push(r);
    }
  }

  return roots.map((root) => ({
    path: root.path,
    side: toSide(root.side),
    line: root.line,
    root: toComment(root),
    replies: (replies.get(root.githubId) ?? [])
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map(toComment),
  }));
}
