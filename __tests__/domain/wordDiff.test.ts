import { describe, expect, test } from "bun:test";
import { parseWordDiff, withWordChanges, type CharRange } from "@/domain/wordDiff.ts";
import type { DiffLine } from "@/domain/diff.ts";

// Real `git diff --word-diff=porcelain --word-diff-regex='[A-Za-z0-9_]+|[^[:space:]]'`
// output. Line 1 has ", z" inserted (new side only); line 3 renames gamma→delta
// and 1→2 (both sides change).
const MODIFY = `diff --git a/f.txt b/f.txt
index 3d832ef..50a5353 100644
--- a/f.txt
+++ b/f.txt
@@ -1,3 +1,3 @@
 const alpha = computeValue(x, y
+, z
 );
~
 unchanged line here
~
 const
-gamma
+delta
  =
-1
+2
 ;
~
`;

// Two whole lines inserted (new-only blocks) plus a full-word rename gamma→gammaX.
const INSERT_AND_RENAME = `diff --git a/f.txt b/f.txt
index 85c3040..69a3e0f 100644
--- a/f.txt
+++ b/f.txt
@@ -1,3 +1,5 @@
 alpha
~
+INSERT1
~
+INSERT2
~
 beta
~
-gamma
+gammaX
~
`;

describe("parseWordDiff", () => {
  test("reconstructs per-line changed ranges by absolute line number", () => {
    const [file] = parseWordDiff(MODIFY);
    expect(file?.oldPath).toBe("f.txt");
    expect(file?.newPath).toBe("f.txt");
    // Old line 1 lost nothing (pure insertion on the new side) → no old ranges.
    expect(file?.oldByLine.get(1)).toBeUndefined();
    // New line 1 gained ", z" at offset 31.
    expect(file?.newByLine.get(1)).toEqual([{ start: 31, end: 34 }]);
    // Line 3: "const" + "gamma"/"delta" + " =" + "1"/"2" + ";". The word token and
    // the number token are the two changed ranges on each side.
    expect(file?.oldByLine.get(3)).toEqual([{ start: 5, end: 10 }, { start: 12, end: 13 }]);
    expect(file?.newByLine.get(3)).toEqual([{ start: 5, end: 10 }, { start: 12, end: 13 }]);
    // Context line 2 unchanged.
    expect(file?.oldByLine.get(2)).toBeUndefined();
    expect(file?.newByLine.get(2)).toBeUndefined();
  });

  test("advances only the new side for pure insertions", () => {
    const [file] = parseWordDiff(INSERT_AND_RENAME);
    // Inserted whole lines land on new lines 2 and 3, covering their full width.
    expect(file?.newByLine.get(2)).toEqual([{ start: 0, end: 7 }]);
    expect(file?.newByLine.get(3)).toEqual([{ start: 0, end: 7 }]);
    // The rename pairs old line 3 with new line 5.
    expect(file?.oldByLine.get(3)).toEqual([{ start: 0, end: 5 }]);
    expect(file?.newByLine.get(5)).toEqual([{ start: 0, end: 6 }]);
  });

  test("returns an empty list for an empty diff", () => {
    expect(parseWordDiff("")).toEqual([]);
  });
});

/** Build a minimal DiffLine for gate tests. */
function del(oldNo: number, text: string): DiffLine {
  return { kind: "del", oldNo, newNo: undefined, text };
}
function add(newNo: number, text: string): DiffLine {
  return { kind: "add", oldNo: undefined, newNo, text };
}

describe("withWordChanges", () => {
  test("attaches ranges to the matching side by line number", () => {
    const fc = {
      oldPath: "f.txt", newPath: "f.txt",
      oldByLine: new Map<number, CharRange[]>([[3, [{ start: 6, end: 11 }]]]),
      newByLine: new Map<number, CharRange[]>([[3, [{ start: 6, end: 11 }]]]),
    };
    const lines = [del(3, "const gamma = 1;"), add(3, "const delta = 2;")];
    const [d, a] = withWordChanges(lines, fc);
    expect(d?.changes).toEqual([{ start: 6, end: 11 }]);
    expect(a?.changes).toEqual([{ start: 6, end: 11 }]);
  });

  test("does not mutate the input lines", () => {
    const fc = {
      oldPath: "f", newPath: "f",
      oldByLine: new Map<number, CharRange[]>([[1, [{ start: 0, end: 2 }]]]),
      newByLine: new Map<number, CharRange[]>(),
    };
    const lines = [del(1, " abcdefghij")];
    withWordChanges(lines, fc);
    expect(lines[0]).not.toHaveProperty("changes");
  });

  test("gates near-total rewrites (whole line changed)", () => {
    const fc = {
      oldPath: "f", newPath: "f",
      // Whole 7-char line is one changed range → 100% → gated away.
      oldByLine: new Map<number, CharRange[]>(),
      newByLine: new Map<number, CharRange[]>([[2, [{ start: 0, end: 7 }]]]),
    };
    const [a] = withWordChanges([add(2, "INSERT1")], fc);
    expect(a?.changes).toBeUndefined();
  });

  test("gates when more than 60% of the line changed", () => {
    const fc = {
      oldPath: "f", newPath: "f",
      oldByLine: new Map<number, CharRange[]>(),
      // 4 of 6 chars changed → 0.67, above the 0.6 gate.
      newByLine: new Map<number, CharRange[]>([[1, [{ start: 0, end: 4 }]]]),
    };
    const [a] = withWordChanges([add(1, "abcdef")], fc);
    expect(a?.changes).toBeUndefined();
  });

  test("keeps ranges when half the line changed (below the 0.6 gate)", () => {
    const fc = {
      oldPath: "f", newPath: "f",
      oldByLine: new Map<number, CharRange[]>(),
      // 3 of 6 chars changed → 0.5, below the gate.
      newByLine: new Map<number, CharRange[]>([[1, [{ start: 0, end: 3 }]]]),
    };
    const [a] = withWordChanges([add(1, "abcdef")], fc);
    expect(a?.changes).toEqual([{ start: 0, end: 3 }]);
  });

  test("keeps ranges for partial changes below the gate", () => {
    const fc = {
      oldPath: "f", newPath: "f",
      oldByLine: new Map<number, CharRange[]>(),
      // 3 of 34 chars changed → well below the gate.
      newByLine: new Map<number, CharRange[]>([[1, [{ start: 31, end: 34 }]]]),
    };
    const [a] = withWordChanges([add(1, "const alpha = computeValue(x, y, z);")], fc);
    expect(a?.changes).toEqual([{ start: 31, end: 34 }]);
  });
});
