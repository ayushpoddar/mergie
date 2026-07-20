import type { Database } from "bun:sqlite";

/**
 * Input required to create a new artifact record. The caller supplies all
 * timestamps so they remain deterministic in tests.
 */
export interface ArtifactInput {
  /** The baseline commit SHA for the range this artifact was generated under. */
  rangeStartSha: string;
  /** The end commit SHA for the range this artifact was generated under. */
  rangeEndSha: string;
  /**
   * Foreign key referencing the chat_session that produced this artifact.
   * Null when the artifact was not generated from a specific session.
   */
  sessionId: number | null;
  /** Path to the artifact file relative to the PR artifacts directory. */
  relPath: string;
  /** Human-readable title shown in the artifacts browser. */
  title: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
}

/**
 * A fully-hydrated artifact row as returned by the repository.
 * Extends {@link ArtifactInput} with the auto-generated id.
 */
export interface ArtifactRow extends ArtifactInput {
  /** Auto-increment primary key. */
  id: number;
}

/** Persistence for AI-generated artifact records. */
export interface ArtifactsRepo {
  /** Persist a new artifact and return its auto-generated id. */
  create(input: ArtifactInput): number;
  /** All artifacts generated under the given commit range. */
  listByRange(rangeStartSha: string, rangeEndSha: string): ArtifactRow[];
  /** Every artifact in the database. */
  listAll(): ArtifactRow[];
}

/** Raw DB row for the artifact table. */
interface ArtifactDbRow {
  id: number;
  range_start_sha: string;
  range_end_sha: string;
  session_id: number | null;
  rel_path: string;
  title: string;
  created_at: number;
}

/** Map a raw DB row to the public {@link ArtifactRow} shape. */
function toRow(r: ArtifactDbRow): ArtifactRow {
  return {
    id: r.id,
    rangeStartSha: r.range_start_sha,
    rangeEndSha: r.range_end_sha,
    sessionId: r.session_id,
    relPath: r.rel_path,
    title: r.title,
    createdAt: r.created_at,
  };
}

/** Create an {@link ArtifactsRepo} backed by the given database. */
export function artifactsRepo(db: Database): ArtifactsRepo {
  const insert = db.query<{ id: number }, [string, string, number | null, string, string, number]>(`
    INSERT INTO artifact (range_start_sha, range_end_sha, session_id, rel_path, title, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id
  `);

  const byRange = db.query<ArtifactDbRow, [string, string]>(
    "SELECT * FROM artifact WHERE range_start_sha = ? AND range_end_sha = ?",
  );

  const all = db.query<ArtifactDbRow, []>("SELECT * FROM artifact");

  return {
    create(input) {
      const result = insert.get(
        input.rangeStartSha,
        input.rangeEndSha,
        input.sessionId,
        input.relPath,
        input.title,
        input.createdAt,
      );
      return result!.id;
    },
    listByRange(rangeStartSha, rangeEndSha) {
      return byRange.all(rangeStartSha, rangeEndSha).map(toRow);
    },
    listAll() {
      return all.all().map(toRow);
    },
  };
}
