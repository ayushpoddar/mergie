import { describe, expect, test } from "bun:test";
import {
  isRangeReviewed,
  isStale,
  isValidRange,
  resolveDefaultRange,
  type PrCommits,
  type Range,
  type ReviewedRange,
} from "@/domain/ranges.ts";

const PR: PrCommits = {
  baselineSha: "base0",
  commits: ["c1", "c2", "c3", "c4"],
};

describe("isRangeReviewed", () => {
  const reviewed: ReviewedRange[] = [
    { startSha: "base0", endSha: "c4", createdAt: 1 },
    { startSha: "c1", endSha: "c3", createdAt: 2 },
  ];
  const CASES: Array<[string, Range, boolean]> = [
    ["full range already reviewed", { startSha: "base0", endSha: "c4" }, true],
    ["sub-range already reviewed", { startSha: "c1", endSha: "c3" }, true],
    ["range not reviewed", { startSha: "c2", endSha: "c4" }, false],
    ["same start, different end", { startSha: "base0", endSha: "c3" }, false],
    ["same end, different start", { startSha: "c2", endSha: "c3" }, false],
  ];
  test.each(CASES)("%s", (_label, range, expected) => {
    expect(isRangeReviewed(range, reviewed)).toBe(expected);
  });

  test("no reviewed ranges → false", () => {
    expect(isRangeReviewed({ startSha: "base0", endSha: "c4" }, [])).toBe(false);
  });
});

describe("resolveDefaultRange", () => {
  test("no reviewed ranges → whole PR (baseline → head)", () => {
    expect(resolveDefaultRange(PR, [])).toEqual({ startSha: "base0", endSha: "c4" });
  });

  test("with reviewed ranges → latest reviewed end → head", () => {
    const reviewed: ReviewedRange[] = [
      { startSha: "base0", endSha: "c2", createdAt: 100 },
      { startSha: "c2", endSha: "c3", createdAt: 200 },
    ];
    expect(resolveDefaultRange(PR, reviewed)).toEqual({ startSha: "c3", endSha: "c4" });
  });

  test("skips stale reviewed ranges whose end no longer exists", () => {
    const reviewed: ReviewedRange[] = [
      { startSha: "base0", endSha: "c2", createdAt: 100 },
      { startSha: "c2", endSha: "gone", createdAt: 300 },
    ];
    expect(resolveDefaultRange(PR, reviewed)).toEqual({ startSha: "c2", endSha: "c4" });
  });
});

describe("isStale", () => {
  test("true when an endpoint is absent from the PR", () => {
    expect(isStale({ startSha: "c1", endSha: "gone" }, PR)).toBe(true);
    expect(isStale({ startSha: "nope", endSha: "c3" }, PR)).toBe(true);
  });
  test("false when both endpoints are present", () => {
    expect(isStale({ startSha: "base0", endSha: "c3" }, PR)).toBe(false);
  });
});

describe("isValidRange", () => {
  /** [start, end, expected] */
  const CASES: Array<[string, string, boolean]> = [
    ["base0", "c4", true],
    ["c1", "c3", true],
    ["c3", "c1", false], // reversed order
    ["c2", "c2", false], // empty
    ["base0", "gone", false], // unknown end
    ["nope", "c2", false], // unknown start
  ];
  test.each(CASES)("(%s, %s) -> %p", (start, end, expected) => {
    expect(isValidRange(start, end, PR)).toBe(expected);
  });
});
