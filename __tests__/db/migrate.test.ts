import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, openDatabase } from "@/db/migrate.ts";
import { SCHEMA_VERSION } from "@/db/schema.ts";

/** Names every table migration must create. */
const EXPECTED_TABLES = [
  "meta", "hunk_view", "reviewed_range", "comment", "github_comment",
  "ai_review", "chat_session", "chat_message", "artifact",
].sort();

function tableNames(db: Database): string[] {
  const rows = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all();
  return rows.map((r) => r.name).sort();
}

describe("migrate", () => {
  test("creates all expected tables", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(tableNames(db)).toEqual(EXPECTED_TABLES);
  });

  test("records the schema version in meta", () => {
    const db = new Database(":memory:");
    migrate(db);
    const row = db.query<{ value: string }, []>("SELECT value FROM meta WHERE key='schema_version'").get();
    expect(row?.value).toBe(String(SCHEMA_VERSION));
  });

  test("is idempotent (safe to run twice)", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(tableNames(db)).toEqual(EXPECTED_TABLES);
  });

  test("openDatabase returns a migrated in-memory database", () => {
    const db = openDatabase(":memory:");
    expect(tableNames(db)).toEqual(EXPECTED_TABLES);
  });
});
