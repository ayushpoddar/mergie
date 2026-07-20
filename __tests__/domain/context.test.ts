import { describe, expect, test } from "bun:test";
import { sliceContext } from "@/domain/context.ts";

const LINES = ["a", "b", "c", "d", "e", "f", "g"];

describe("sliceContext", () => {
  // [lines, line, n, expected]
  const cases: Array<
    [string[], number, number, { before: string[]; matched: string; after: string[] }]
  > = [
    // Mid-file: full window on both sides.
    [LINES, 4, 2, { before: ["b", "c"], matched: "d", after: ["e", "f"] }],
    // Clamped at start: fewer before lines available.
    [LINES, 1, 3, { before: [], matched: "a", after: ["b", "c", "d"] }],
    // Clamped at end: fewer after lines available.
    [LINES, 7, 3, { before: ["d", "e", "f"], matched: "g", after: [] }],
    // n = 0: only the matched line.
    [LINES, 3, 0, { before: [], matched: "c", after: [] }],
    // Out-of-range line (too high): matched is "".
    [LINES, 99, 2, { before: [], matched: "", after: [] }],
    // Out-of-range line (too low): matched is "".
    [LINES, 0, 2, { before: [], matched: "", after: [] }],
  ];

  test.each(cases)(
    "sliceContext(lines, %p, %p)",
    (lines, line, n, expected) => {
      expect(sliceContext(lines, line, n)).toEqual(expected);
    },
  );
});
