import { describe, expect, test } from "bun:test";
import { resultCountLabel } from "@/web/lib/resultCountLabel.ts";

describe("resultCountLabel", () => {
  // [total, shown, expected]
  const cases: Array<[number, number, string]> = [
    [0, 0, "0 results"],
    [1, 1, "1 result"],
    [5, 5, "5 results"],
    [10, 3, "showing 3 of 10"], // shown < total → "showing X of Y"
    [10, 0, "showing 0 of 10"],
  ];

  test.each(cases)("resultCountLabel(%p, %p) === %p", (total, shown, expected) => {
    expect(resultCountLabel(total, shown)).toBe(expected);
  });
});
