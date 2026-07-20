import { describe, expect, test } from "bun:test";
import { buildLinesAnchor } from "@/web/lib/lineSelection.ts";
import type { DiffLine } from "@/domain/diff.ts";

const LINES: DiffLine[] = [
  { kind: "ctx", oldNo: 1, newNo: 1, text: "a" },
  { kind: "del", oldNo: 2, newNo: undefined, text: "b" },
  { kind: "add", oldNo: undefined, newNo: 2, text: "c" },
  { kind: "ctx", oldNo: 3, newNo: 3, text: "d" },
];

describe("buildLinesAnchor", () => {
  test("single context line → RIGHT side, its new number", () => {
    expect(buildLinesAnchor(LINES, 0, 0)).toEqual({ side: "RIGHT", lineText: "a", lineNo: 1, endLineNo: 1 });
  });

  test("single deleted line → LEFT side, its old number", () => {
    expect(buildLinesAnchor(LINES, 1, 1)).toEqual({ side: "LEFT", lineText: "b", lineNo: 2, endLineNo: 2 });
  });

  test("range spanning ctx+del+add → RIGHT side, joins head-side lines", () => {
    expect(buildLinesAnchor(LINES, 0, 2)).toEqual({ side: "RIGHT", lineText: "a\nc", lineNo: 1, endLineNo: 2 });
  });

  test("normalizes reversed selection", () => {
    expect(buildLinesAnchor(LINES, 2, 0)).toEqual({ side: "RIGHT", lineText: "a\nc", lineNo: 1, endLineNo: 2 });
  });
});
