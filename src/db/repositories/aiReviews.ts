import type { Database } from "bun:sqlite";

/**
 * Input required to create a new AI review record. The caller supplies all
 * timestamps so they stay deterministic in tests.
 */
export interface AiReviewInput {
  /** The baseline (exclusive) commit SHA for this review. */
  startSha: string;
  /** The end (inclusive) commit SHA for this review. */
  endSha: string;
  /** Model identifier used to generate the review (e.g. `'claude-3-opus'`). */
  model: string;
  /** Optional template id from config (e.g. `'adversarial'`). */
  template: string | null;
  /** Optional user-supplied prompt to focus the review. */
  prompt: string | null;
  /** Markdown body of the review result. */
  body: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
}

/**
 * A fully-hydrated AI review row as returned by the repository.
 * Extends {@link AiReviewInput} with the auto-generated id.
 */
export interface AiReviewRow extends AiReviewInput {
  /** Auto-increment primary key. */
  id: number;
}

/** Persistence for AI-generated review results. */
export interface AiReviewsRepo {
  /** Persist a new AI review and return its auto-generated id. */
  create(input: AiReviewInput): number;
  /** Fetch an AI review by id; returns null if not found. */
  get(id: number): AiReviewRow | null;
  /** All AI reviews for the given commit range. */
  listByRange(startSha: string, endSha: string): AiReviewRow[];
  /** Every AI review in the database. */
  listAll(): AiReviewRow[];
}

/** Raw DB row for the ai_review table. */
interface AiReviewDbRow {
  id: number;
  start_sha: string;
  end_sha: string;
  model: string;
  template: string | null;
  prompt: string | null;
  body: string;
  created_at: number;
}

/** Map a raw DB row to the public {@link AiReviewRow} shape. */
function toRow(r: AiReviewDbRow): AiReviewRow {
  return {
    id: r.id,
    startSha: r.start_sha,
    endSha: r.end_sha,
    model: r.model,
    template: r.template,
    prompt: r.prompt,
    body: r.body,
    createdAt: r.created_at,
  };
}

/** Create an {@link AiReviewsRepo} backed by the given database. */
export function aiReviewsRepo(db: Database): AiReviewsRepo {
  const insert = db.query<{ id: number }, [string, string, string, string | null, string | null, string, number]>(`
    INSERT INTO ai_review (start_sha, end_sha, model, template, prompt, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `);

  const selectOne = db.query<AiReviewDbRow, [number]>(
    "SELECT * FROM ai_review WHERE id = ?",
  );

  const byRange = db.query<AiReviewDbRow, [string, string]>(
    "SELECT * FROM ai_review WHERE start_sha = ? AND end_sha = ?",
  );

  const all = db.query<AiReviewDbRow, []>("SELECT * FROM ai_review");

  return {
    create(input) {
      const result = insert.get(
        input.startSha,
        input.endSha,
        input.model,
        input.template,
        input.prompt,
        input.body,
        input.createdAt,
      );
      return result!.id;
    },
    get(id) {
      const row = selectOne.get(id);
      return row ? toRow(row) : null;
    },
    listByRange(startSha, endSha) {
      return byRange.all(startSha, endSha).map(toRow);
    },
    listAll() {
      return all.all().map(toRow);
    },
  };
}
