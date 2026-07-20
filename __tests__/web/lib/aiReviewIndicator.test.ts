import { describe, expect, test } from "bun:test";
import { summariseAiReviewStatuses } from "@/web/lib/aiReviewIndicator.ts";
import type { AiReviewStatus } from "@/daemon/aiReviewTracker.ts";

const running: AiReviewStatus = { startSha: "a1", endSha: "b2", state: "running", reviewId: null, error: null };
const running2: AiReviewStatus = { startSha: "c3", endSha: "d4", state: "running", reviewId: null, error: null };
const done: AiReviewStatus = { startSha: "e5", endSha: "f6", state: "done", reviewId: 9, error: null };
const failed: AiReviewStatus = { startSha: "g7", endSha: "h8", state: "failed", reviewId: null, error: "boom" };

describe("summariseAiReviewStatuses", () => {
  test("returns null when there is nothing to show", () => {
    expect(summariseAiReviewStatuses([])).toBeNull();
  });

  test("surfaces a single running review with its count", () => {
    const s = summariseAiReviewStatuses([running]);
    expect(s).toEqual({ state: "running", runningCount: 1, primary: running });
  });

  test("counts multiple running reviews and picks the first as primary", () => {
    const s = summariseAiReviewStatuses([running, running2]);
    expect(s?.state).toBe("running");
    expect(s?.runningCount).toBe(2);
    expect(s?.primary).toEqual(running);
  });

  test("prioritises running over a completed one", () => {
    const s = summariseAiReviewStatuses([done, running]);
    expect(s?.state).toBe("running");
    expect(s?.runningCount).toBe(1);
  });

  test("surfaces a done review when nothing is running", () => {
    const s = summariseAiReviewStatuses([done]);
    expect(s).toEqual({ state: "done", runningCount: 0, primary: done });
  });

  test("surfaces a failed review when nothing is running or done", () => {
    const s = summariseAiReviewStatuses([failed]);
    expect(s).toEqual({ state: "failed", runningCount: 0, primary: failed });
  });

  test("prefers done over failed when both are present and none running", () => {
    const s = summariseAiReviewStatuses([failed, done]);
    expect(s?.state).toBe("done");
    expect(s?.primary).toEqual(done);
  });
});
