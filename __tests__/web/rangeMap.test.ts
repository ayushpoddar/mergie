import { describe, expect, test } from "bun:test";
import { toInclusive, toRange } from "@/web/lib/rangeMap.ts";

const COMMITS = ["c1", "c2", "c3", "c4"];
const BASE = "base0";

describe("toInclusive", () => {
  test("whole PR (start = baseline) → first..last commit", () => {
    expect(toInclusive({ start: BASE, end: "c4" }, COMMITS, BASE)).toEqual({ fromIndex: 0, toIndex: 3 });
  });
  test("sub-range (start = a commit) → excludes that commit", () => {
    // start c2 is the exclusive baseline, so first *included* commit is c3
    expect(toInclusive({ start: "c2", end: "c4" }, COMMITS, BASE)).toEqual({ fromIndex: 2, toIndex: 3 });
  });
});

describe("toRange", () => {
  test("first commit included → start is the baseline", () => {
    expect(toRange({ fromIndex: 0, toIndex: 3 }, COMMITS, BASE)).toEqual({ start: BASE, end: "c4" });
  });
  test("later first-included commit → start is the preceding commit", () => {
    expect(toRange({ fromIndex: 2, toIndex: 3 }, COMMITS, BASE)).toEqual({ start: "c2", end: "c4" });
  });
  test("clamps fromIndex above toIndex to that single commit (c2 only → c1..c2)", () => {
    expect(toRange({ fromIndex: 3, toIndex: 1 }, COMMITS, BASE)).toEqual({ start: "c1", end: "c2" });
  });
});

describe("round-trip", () => {
  test("toInclusive ∘ toRange is identity for valid selections", () => {
    const sel = { fromIndex: 1, toIndex: 2 };
    expect(toInclusive(toRange(sel, COMMITS, BASE), COMMITS, BASE)).toEqual(sel);
  });
});
