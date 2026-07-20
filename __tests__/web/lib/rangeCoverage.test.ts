import { describe, expect, test } from "bun:test";
import { rangeCoverageLabel } from "@/web/lib/rangeCoverage.ts";

/** [label, fromIndex, toIndex, total, expected] */
const cases: [string, number, number, number, string][] = [
  ["full range (all commits)", 0, 2, 3, "All 3 commits"],
  ["full range, single-commit PR", 0, 0, 1, "All 1 commit"],
  ["single commit in the middle", 1, 1, 3, "1 of 3 commits"],
  ["subset (2 of 3, first two)", 0, 1, 3, "2 of 3 commits"],
  ["subset (2 of 3, last two)", 1, 2, 3, "2 of 3 commits"],
  ["first-only of many", 0, 0, 3, "1 of 3 commits"],
  ["last-only of many", 2, 2, 3, "1 of 3 commits"],
  ["all of a two-commit PR", 0, 1, 2, "All 2 commits"],
];

describe("rangeCoverageLabel", () => {
  test.each(cases)("%s", (_label, fromIndex, toIndex, total, expected) => {
    expect(rangeCoverageLabel({ fromIndex, toIndex, total })).toBe(expected);
  });
});
