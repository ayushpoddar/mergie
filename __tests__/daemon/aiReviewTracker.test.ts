import { describe, expect, test } from "bun:test";
import { createAiReviewTracker } from "@/daemon/aiReviewTracker.ts";

const rangeA = { start: "aaaaaaa", end: "bbbbbbb" };
const rangeB = { start: "ccccccc", end: "ddddddd" };

describe("createAiReviewTracker", () => {
  test("has no statuses initially", () => {
    const t = createAiReviewTracker();
    expect(t.list()).toEqual([]);
  });

  test("start marks a range as running", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    expect(t.list()).toEqual([
      { startSha: rangeA.start, endSha: rangeA.end, state: "running", reviewId: null, error: null },
    ]);
  });

  test("finish transitions running → done with the persisted review id", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    t.finish(rangeA, 42);
    expect(t.list()).toEqual([
      { startSha: rangeA.start, endSha: rangeA.end, state: "done", reviewId: 42, error: null },
    ]);
  });

  test("fail transitions running → failed with a message", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    t.fail(rangeA, "model exploded");
    expect(t.list()).toEqual([
      { startSha: rangeA.start, endSha: rangeA.end, state: "failed", reviewId: null, error: "model exploded" },
    ]);
  });

  test("dismiss removes a completed entry", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    t.finish(rangeA, 7);
    t.dismiss(rangeA);
    expect(t.list()).toEqual([]);
  });

  test("dismiss does not remove a still-running entry", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    t.dismiss(rangeA);
    expect(t.list()).toHaveLength(1);
    expect(t.list()[0]?.state).toBe("running");
  });

  test("tracks multiple ranges independently", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    t.start(rangeB);
    t.finish(rangeA, 1);
    const byRange = new Map(t.list().map((s) => [s.startSha, s.state]));
    expect(byRange.get(rangeA.start)).toBe("done");
    expect(byRange.get(rangeB.start)).toBe("running");
  });

  test("starting the same range again resets it to running (clears prior error)", () => {
    const t = createAiReviewTracker();
    t.start(rangeA);
    t.fail(rangeA, "boom");
    t.start(rangeA);
    expect(t.list()).toEqual([
      { startSha: rangeA.start, endSha: rangeA.end, state: "running", reviewId: null, error: null },
    ]);
  });

  test("finish/fail on an unknown range is a no-op", () => {
    const t = createAiReviewTracker();
    t.finish(rangeA, 1);
    t.fail(rangeB, "x");
    expect(t.list()).toEqual([]);
  });
});
