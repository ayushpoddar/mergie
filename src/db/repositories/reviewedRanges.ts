import type { Database } from "bun:sqlite";

/**
 * A single reviewed commit range record as returned by the repository.
 */
export interface ReviewedRangeRow {
  /** Auto-increment primary key. */
  id: number;
  /** The baseline (exclusive) commit SHA. */
  startSha: string;
  /** The end (inclusive) commit SHA. */
  endSha: string;
  /** Unix timestamp (ms) when this range was recorded. */
  createdAt: number;
}

/** Persistence for reviewed commit ranges keyed by (startSha, endSha). */
export interface ReviewedRangesRepo {
  /**
   * Record a reviewed range. Duplicate (startSha, endSha) pairs are silently
   * ignored (INSERT OR IGNORE) — the original record is preserved.
   */
  add(startSha: string, endSha: string, createdAt: number): void;
  /** All recorded ranges ordered by createdAt ascending. */
  list(): ReviewedRangeRow[];
  /** Delete a range by its id. No-op if the id does not exist. */
  remove(id: number): void;
  /** Delete the range matching an exact (startSha, endSha) pair. No-op if absent. */
  removeByRange(startSha: string, endSha: string): void;
}

/** Internal DB row shape for reviewed_range queries. */
interface RangeDbRow {
  id: number;
  start_sha: string;
  end_sha: string;
  created_at: number;
}

/** Map a raw DB row to the public {@link ReviewedRangeRow} shape. */
function toRow(r: RangeDbRow): ReviewedRangeRow {
  return {
    id: r.id,
    startSha: r.start_sha,
    endSha: r.end_sha,
    createdAt: r.created_at,
  };
}

/** Create a {@link ReviewedRangesRepo} backed by the given database. */
export function reviewedRangesRepo(db: Database): ReviewedRangesRepo {
  const insert = db.query(
    "INSERT OR IGNORE INTO reviewed_range (start_sha, end_sha, created_at) VALUES (?, ?, ?)",
  );
  const selectAll = db.query<RangeDbRow, []>(
    "SELECT id, start_sha, end_sha, created_at FROM reviewed_range ORDER BY created_at ASC",
  );
  const del = db.query("DELETE FROM reviewed_range WHERE id = ?");
  const delByRange = db.query("DELETE FROM reviewed_range WHERE start_sha = ? AND end_sha = ?");

  return {
    add(startSha, endSha, createdAt) {
      insert.run(startSha, endSha, createdAt);
    },
    list() {
      return selectAll.all().map(toRow);
    },
    remove(id) {
      del.run(id);
    },
    removeByRange(startSha, endSha) {
      delByRange.run(startSha, endSha);
    },
  };
}
