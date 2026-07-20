/** Current database schema version. Bump when SCHEMA_SQL changes. */
export const SCHEMA_VERSION = 1;

/**
 * Full schema DDL for a per-PR mergie database. All statements use
 * `IF NOT EXISTS` so applying them is idempotent. See docs/PLAN.md for the
 * data model rationale.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hunk_view (
  hunk_hash TEXT PRIMARY KEY,
  viewed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviewed_range (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_sha  TEXT NOT NULL,
  end_sha    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (start_sha, end_sha)
);

CREATE TABLE IF NOT EXISTS comment (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  kind                  TEXT NOT NULL,           -- 'hunk' | 'lines'
  side                  TEXT NOT NULL,           -- 'LEFT' | 'RIGHT'
  path                  TEXT NOT NULL,
  anchor_hash           TEXT NOT NULL,
  start_line            INTEGER,
  end_line              INTEGER,
  made_at_sha           TEXT NOT NULL,
  body                  TEXT NOT NULL,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  github_id             TEXT,
  github_url            TEXT,
  in_reply_to_github_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_comment_anchor ON comment (anchor_hash);

CREATE TABLE IF NOT EXISTS github_comment (
  github_id  TEXT PRIMARY KEY,
  path       TEXT,
  side       TEXT,
  line       INTEGER,
  start_line INTEGER,
  commit_sha TEXT,
  body       TEXT NOT NULL,
  author     TEXT,
  created_at INTEGER,
  in_reply_to TEXT,
  synced_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_review (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_sha  TEXT NOT NULL,
  end_sha    TEXT NOT NULL,
  model      TEXT NOT NULL,
  template   TEXT,
  prompt     TEXT,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_session (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_kind TEXT NOT NULL,                      -- 'hunk' | 'file'
  scope_ref  TEXT NOT NULL,                      -- hunk hash or file path
  title      TEXT NOT NULL,
  model      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_message (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES chat_session (id),
  role       TEXT NOT NULL,                      -- 'user' | 'assistant'
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  range_start_sha TEXT NOT NULL,
  range_end_sha   TEXT NOT NULL,
  session_id     INTEGER,
  rel_path       TEXT NOT NULL,
  title          TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);
`;
