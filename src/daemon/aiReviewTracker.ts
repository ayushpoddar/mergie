import type { ChatRange } from "./registry.ts";

/** Lifecycle state of an AI review the UI can observe. */
export type AiReviewState = "running" | "done" | "failed";

/** Observable status of one AI review, keyed by its commit range. */
export interface AiReviewStatus {
  /** Range baseline SHA. */
  startSha: string;
  /** Range end SHA. */
  endSha: string;
  /** Current lifecycle state. */
  state: AiReviewState;
  /** Persisted review row id once done; null while running or on failure. */
  reviewId: number | null;
  /** Error message when failed; null otherwise. */
  error: string | null;
}

/**
 * Per-PR tracker of in-flight and recently-completed AI reviews, keyed by
 * commit range. Lets the UI show a persistent "review in progress / ready /
 * failed" indicator independent of whichever popup started the run. A completed
 * (done/failed) entry lingers until explicitly dismissed (e.g. after the user
 * clicks through to the result); a running entry cannot be dismissed.
 */
export interface AiReviewTracker {
  /** Mark a range's review as running (resets any prior state for that range). */
  start(range: ChatRange): void;
  /** Transition a running range → done, recording the persisted review id. */
  finish(range: ChatRange, reviewId: number): void;
  /** Transition a running range → failed, recording an error message. */
  fail(range: ChatRange, error: string): void;
  /** Remove a completed (done/failed) entry; running entries are kept. */
  dismiss(range: ChatRange): void;
  /** Snapshot of all tracked statuses. */
  list(): AiReviewStatus[];
}

/** Map key for a range. */
function key(range: ChatRange): string {
  return `${range.start}:${range.end}`;
}

/** Create an {@link AiReviewTracker}. */
export function createAiReviewTracker(): AiReviewTracker {
  const statuses = new Map<string, AiReviewStatus>();

  return {
    start(range) {
      statuses.set(key(range), {
        startSha: range.start, endSha: range.end, state: "running", reviewId: null, error: null,
      });
    },
    finish(range, reviewId) {
      const cur = statuses.get(key(range));
      if (!cur) return;
      statuses.set(key(range), { ...cur, state: "done", reviewId, error: null });
    },
    fail(range, error) {
      const cur = statuses.get(key(range));
      if (!cur) return;
      statuses.set(key(range), { ...cur, state: "failed", reviewId: null, error });
    },
    dismiss(range) {
      const cur = statuses.get(key(range));
      if (cur && cur.state !== "running") statuses.delete(key(range));
    },
    list: () => [...statuses.values()],
  };
}
