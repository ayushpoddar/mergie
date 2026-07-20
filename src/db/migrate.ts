import { Database } from "bun:sqlite";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

/**
 * Apply the schema to a database and record the schema version. Idempotent —
 * uses `IF NOT EXISTS` DDL so it is safe to run on every open.
 */
export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  db.query("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(
    String(SCHEMA_VERSION),
  );
}

/**
 * Open (creating if needed) a SQLite database at `path`, apply migrations, and
 * return the ready-to-use handle. Pass `:memory:` for tests.
 */
export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}
