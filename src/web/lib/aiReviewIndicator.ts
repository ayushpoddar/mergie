import type { AiReviewState, AiReviewStatus } from "@/daemon/aiReviewTracker.ts";

/** What the header indicator should display, derived from raw statuses. */
export interface AiReviewSummary {
  /** Which state the indicator reflects. */
  state: AiReviewState;
  /** How many reviews are currently running (0 when not in a running state). */
  runningCount: number;
  /** The status to act on (open its range) when the indicator is clicked. */
  primary: AiReviewStatus;
}

/**
 * Reduce the per-range AI-review statuses to the one thing the header indicator
 * should show. Priority: any running review wins (with a count of how many are
 * running); otherwise a completed (done) review is surfaced as clickable-ready;
 * otherwise a failed one. Returns null when there is nothing to show.
 */
export function summariseAiReviewStatuses(statuses: AiReviewStatus[]): AiReviewSummary | null {
  const running = statuses.filter((s) => s.state === "running");
  if (running.length > 0 && running[0]) {
    return { state: "running", runningCount: running.length, primary: running[0] };
  }
  const done = statuses.find((s) => s.state === "done");
  if (done) return { state: "done", runningCount: 0, primary: done };
  const failed = statuses.find((s) => s.state === "failed");
  if (failed) return { state: "failed", runningCount: 0, primary: failed };
  return null;
}
