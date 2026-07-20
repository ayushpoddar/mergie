import type { Database } from "bun:sqlite";

/**
 * An inbound GitHub inline comment (or reply) cached from the GitHub API.
 * Used both as the input shape for writes and as the row shape for reads,
 * because the primary key (`githubId`) comes from GitHub, not auto-increment.
 */
export interface GithubCommentRow {
  /** GitHub's stable comment id — the primary key. */
  githubId: string;
  /** Repo-relative file path the comment was made on. */
  path: string | null;
  /** Diff side (`'LEFT'` or `'RIGHT'`). */
  side: string | null;
  /** Line number the comment is anchored to (1-based). */
  line: number | null;
  /** First line of a multi-line comment span; null for single-line. */
  startLine: number | null;
  /** The commit SHA the comment was posted against. */
  commitSha: string | null;
  /** Markdown body of the comment. */
  body: string;
  /** GitHub username of the comment author. */
  author: string | null;
  /**
   * When the comment was created on GitHub, as a Unix timestamp in
   * milliseconds. May be null if the API response omits it.
   */
  createdAt: number | null;
  /** GitHub id of the parent comment if this is a reply; null otherwise. */
  inReplyTo: string | null;
  /** When this row was last synced from GitHub (ms). */
  syncedAt: number;
}

/** Persistence for the inbound GitHub inline comment cache. */
export interface GithubCommentsRepo {
  /**
   * Insert or fully replace a GitHub comment row keyed by githubId.
   * Uses `INSERT OR REPLACE` — all fields are overwritten on conflict.
   */
  upsert(row: GithubCommentRow): void;
  /**
   * Replace the entire table with the provided rows in a single transaction.
   * Clears all existing rows first, then bulk-inserts the new set.
   */
  replaceAll(rows: GithubCommentRow[]): void;
  /** Every GitHub comment in the cache. */
  listAll(): GithubCommentRow[];
  /** All GitHub comments on the given file path. */
  listByPath(path: string): GithubCommentRow[];
  /** Delete the cached row for a GitHub comment id. No-op if absent. */
  remove(githubId: string): void;
  /** Update only the body of the cached row for a GitHub comment id. No-op if absent. */
  updateBody(githubId: string, body: string): void;
}

/** Raw DB row for the github_comment table. */
interface GithubCommentDbRow {
  github_id: string;
  path: string | null;
  side: string | null;
  line: number | null;
  start_line: number | null;
  commit_sha: string | null;
  body: string;
  author: string | null;
  created_at: number | null;
  in_reply_to: string | null;
  synced_at: number;
}

/** Map a raw DB row to the public {@link GithubCommentRow} shape. */
function toRow(r: GithubCommentDbRow): GithubCommentRow {
  return {
    githubId: r.github_id,
    path: r.path,
    side: r.side,
    line: r.line,
    startLine: r.start_line,
    commitSha: r.commit_sha,
    body: r.body,
    author: r.author,
    createdAt: r.created_at,
    inReplyTo: r.in_reply_to,
    syncedAt: r.synced_at,
  };
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO github_comment
    (github_id, path, side, line, start_line, commit_sha, body, author, created_at, in_reply_to, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Create a {@link GithubCommentsRepo} backed by the given database. */
export function githubCommentsRepo(db: Database): GithubCommentsRepo {
  const upsertStmt = db.query<
    void,
    [string, string | null, string | null, number | null, number | null, string | null, string, string | null, number | null, string | null, number]
  >(INSERT_SQL);

  const all = db.query<GithubCommentDbRow, []>("SELECT * FROM github_comment");

  const byPath = db.query<GithubCommentDbRow, [string]>(
    "SELECT * FROM github_comment WHERE path = ?",
  );

  const clearAll = db.query("DELETE FROM github_comment");

  const deleteOne = db.query("DELETE FROM github_comment WHERE github_id = ?");

  const updateBodyStmt = db.query("UPDATE github_comment SET body = ? WHERE github_id = ?");

  const replaceAllFn = db.transaction((rows: GithubCommentRow[]) => {
    clearAll.run();
    for (const row of rows) {
      upsertStmt.run(
        row.githubId,
        row.path,
        row.side,
        row.line,
        row.startLine,
        row.commitSha,
        row.body,
        row.author,
        row.createdAt,
        row.inReplyTo,
        row.syncedAt,
      );
    }
  });

  return {
    upsert(row) {
      upsertStmt.run(
        row.githubId,
        row.path,
        row.side,
        row.line,
        row.startLine,
        row.commitSha,
        row.body,
        row.author,
        row.createdAt,
        row.inReplyTo,
        row.syncedAt,
      );
    },
    replaceAll(rows) {
      replaceAllFn(rows);
    },
    listAll() {
      return all.all().map(toRow);
    },
    listByPath(path) {
      return byPath.all(path).map(toRow);
    },
    remove(githubId) {
      deleteOne.run(githubId);
    },
    updateBody(githubId, body) {
      updateBodyStmt.run(body, githubId);
    },
  };
}
