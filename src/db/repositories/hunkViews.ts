import type { Database } from "bun:sqlite";

/** Persistence for per-hunk viewed state, keyed by hunk content hash. */
export interface HunkViewsRepo {
  /** Mark a hunk viewed at the given timestamp (ms); idempotent. */
  markViewed(hunkHash: string, at: number): void;
  /** Remove a hunk's viewed state. */
  unmarkViewed(hunkHash: string): void;
  /** Whether a hunk hash is currently marked viewed. */
  isViewed(hunkHash: string): boolean;
  /** All currently-viewed hunk hashes. */
  viewedHashes(): string[];
}

/** Create a {@link HunkViewsRepo} backed by the given database. */
export function hunkViewsRepo(db: Database): HunkViewsRepo {
  const insert = db.query("INSERT OR REPLACE INTO hunk_view (hunk_hash, viewed_at) VALUES (?, ?)");
  const del = db.query("DELETE FROM hunk_view WHERE hunk_hash = ?");
  const one = db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM hunk_view WHERE hunk_hash = ?");
  const all = db.query<{ hunk_hash: string }, []>("SELECT hunk_hash FROM hunk_view");

  return {
    markViewed(hunkHash, at) {
      insert.run(hunkHash, at);
    },
    unmarkViewed(hunkHash) {
      del.run(hunkHash);
    },
    isViewed(hunkHash) {
      return (one.get(hunkHash)?.n ?? 0) > 0;
    },
    viewedHashes() {
      return all.all().map((r) => r.hunk_hash);
    },
  };
}
