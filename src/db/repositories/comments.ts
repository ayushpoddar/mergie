import type { Database } from "bun:sqlite";

/**
 * The kind of comment — whether it targets a whole hunk or a line range.
 *
 * - `'hunk'` — comment on the entire hunk.
 * - `'lines'` — comment on a specific line range.
 */
export type CommentKind = "hunk" | "lines";

/**
 * Which side of the diff the comment applies to.
 *
 * - `'LEFT'` — the base (start) version of the file.
 * - `'RIGHT'` — the head (end) version of the file.
 */
export type CommentSide = "LEFT" | "RIGHT";

/**
 * Input required to create a new comment. Timestamps must be supplied by the
 * caller so they remain deterministic in tests.
 */
export interface CommentInput {
  /** Whether the comment targets a whole hunk or a line range. */
  kind: CommentKind;
  /** Which diff side the comment appears on. */
  side: CommentSide;
  /** Repo-relative file path. */
  path: string;
  /** Content hash of {path, side, exact line text}. Controls visibility. */
  anchorHash: string;
  /** First line of the range (1-based, nullable for hunk-level comments). */
  startLine: number | null;
  /** Last line of the range (1-based, nullable for hunk-level comments). */
  endLine: number | null;
  /** SHA of the commit that was the head when the comment was made. */
  madeAtSha: string;
  /** Markdown body text. */
  body: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
  /** Last-updated timestamp in milliseconds. */
  updatedAt: number;
  /** GitHub comment id when posted; null otherwise. */
  githubId: string | null;
  /** GitHub URL when posted; null otherwise. */
  githubUrl: string | null;
  /** GitHub id of the comment being replied to; null for top-level. */
  inReplyToGithubId: string | null;
}

/**
 * A fully-hydrated comment row as returned by the repository.
 * Extends {@link CommentInput} with the auto-generated id.
 */
export interface CommentRow extends CommentInput {
  /** Auto-increment primary key. */
  id: number;
}

/** Persistence for user-authored comments. */
export interface CommentsRepo {
  /** Persist a new comment and return its auto-generated id. */
  create(input: CommentInput): number;
  /** Fetch a comment by id; returns null if not found. */
  get(id: number): CommentRow | null;
  /** Update the body and updatedAt of an existing comment. No-op if not found. */
  update(id: number, fields: { body: string; updatedAt: number }): void;
  /** Delete a comment by id. No-op if not found. */
  remove(id: number): void;
  /** All comments whose anchorHash matches. */
  listByAnchor(anchorHash: string): CommentRow[];
  /** Every comment in the database. */
  listAll(): CommentRow[];
  /** Record that a comment was posted to GitHub; updates githubId + githubUrl. */
  setGithub(id: number, fields: { githubId: string; githubUrl: string }): void;
  /** Clear GitHub association from a comment (sets githubId/githubUrl to null). */
  clearGithub(id: number): void;
}

/** Raw DB row for the comment table. */
interface CommentDbRow {
  id: number;
  kind: string;
  side: string;
  path: string;
  anchor_hash: string;
  start_line: number | null;
  end_line: number | null;
  made_at_sha: string;
  body: string;
  created_at: number;
  updated_at: number;
  github_id: string | null;
  github_url: string | null;
  in_reply_to_github_id: string | null;
}

/** Map a raw DB row to the public {@link CommentRow} shape. */
function toRow(r: CommentDbRow): CommentRow {
  return {
    id: r.id,
    kind: r.kind as CommentKind,
    side: r.side as CommentSide,
    path: r.path,
    anchorHash: r.anchor_hash,
    startLine: r.start_line,
    endLine: r.end_line,
    madeAtSha: r.made_at_sha,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    githubId: r.github_id,
    githubUrl: r.github_url,
    inReplyToGithubId: r.in_reply_to_github_id,
  };
}

/** Create a {@link CommentsRepo} backed by the given database. */
export function commentsRepo(db: Database): CommentsRepo {
  const insert = db.query<{ id: number }, [string, string, string, string, number | null, number | null, string, string, number, number, string | null, string | null, string | null]>(`
    INSERT INTO comment
      (kind, side, path, anchor_hash, start_line, end_line, made_at_sha,
       body, created_at, updated_at, github_id, github_url, in_reply_to_github_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `);

  const selectOne = db.query<CommentDbRow, [number]>(
    "SELECT * FROM comment WHERE id = ?",
  );

  const updateStmt = db.query(
    "UPDATE comment SET body = ?, updated_at = ? WHERE id = ?",
  );

  const del = db.query("DELETE FROM comment WHERE id = ?");

  const byAnchor = db.query<CommentDbRow, [string]>(
    "SELECT * FROM comment WHERE anchor_hash = ?",
  );

  const all = db.query<CommentDbRow, []>("SELECT * FROM comment");

  const setGithubStmt = db.query(
    "UPDATE comment SET github_id = ?, github_url = ? WHERE id = ?",
  );

  const clearGithubStmt = db.query(
    "UPDATE comment SET github_id = NULL, github_url = NULL WHERE id = ?",
  );

  return {
    create(input) {
      const result = insert.get(
        input.kind,
        input.side,
        input.path,
        input.anchorHash,
        input.startLine,
        input.endLine,
        input.madeAtSha,
        input.body,
        input.createdAt,
        input.updatedAt,
        input.githubId,
        input.githubUrl,
        input.inReplyToGithubId,
      );
      return result!.id;
    },
    get(id) {
      const row = selectOne.get(id);
      return row ? toRow(row) : null;
    },
    update(id, fields) {
      updateStmt.run(fields.body, fields.updatedAt, id);
    },
    remove(id) {
      del.run(id);
    },
    listByAnchor(anchorHash) {
      return byAnchor.all(anchorHash).map(toRow);
    },
    listAll() {
      return all.all().map(toRow);
    },
    setGithub(id, fields) {
      setGithubStmt.run(fields.githubId, fields.githubUrl, id);
    },
    clearGithub(id) {
      clearGithubStmt.run(id);
    },
  };
}
