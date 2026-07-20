import { describe, expect, test } from "bun:test";
import { firstChangedIndexFrom } from "@/web/lib/anchorRow.ts";
import type { SplitCell, SplitRow } from "@/daemon/splitView.ts";

const ctxCell: SplitCell = { no: 1, text: "x", kind: "ctx" };
const addCell: SplitCell = { no: 1, text: "x", kind: "add" };
const delCell: SplitCell = { no: 1, text: "x", kind: "del" };
const emptyCell: SplitCell = { no: null, text: "", kind: "empty" };

const ctxRow: SplitRow = { left: ctxCell, right: ctxCell };
/** A deletion paired with an addition (both sides changed). */
const modRow: SplitRow = { left: delCell, right: addCell };
/** An added line with empty base padding (added-only change block). */
const addRow: SplitRow = { left: emptyCell, right: addCell };
/** A deleted line with empty head padding (deleted-only change block). */
const delRow: SplitRow = { left: delCell, right: emptyCell };

/**
 * A modified file: two context rows (e.g. the `}` at anchorLine), then the
 * real change block. Anchoring at a context row should jump to the first
 * change below it.
 */
const modifiedRows: SplitRow[] = [ctxRow, ctxRow, modRow, ctxRow, addRow];
/** An added file (single-column path): first line is already a change. */
const addedRows: SplitRow[] = [addRow, addRow, addRow];
/** A deleted file: first line is already a change. */
const deletedRows: SplitRow[] = [delRow, delRow];
/** An all-context slice with no changes anywhere. */
const noChangeRows: SplitRow[] = [ctxRow, ctxRow, ctxRow];

/** [label, rows, startIdx, expected] */
const cases: [string, SplitRow[], number, number][] = [
  ["context start jumps to first change below", modifiedRows, 0, 2],
  ["start exactly on the change stays put", modifiedRows, 2, 2],
  ["start past first change finds the next one", modifiedRows, 3, 4],
  ["added file: first line is the first change", addedRows, 0, 0],
  ["deleted file: first line is the first change", deletedRows, 0, 0],
  ["no change at/after start falls back to start", noChangeRows, 1, 1],
  ["no change at all falls back to start", modifiedRows, 5, 5],
  ["negative start (no anchor) is returned unchanged", modifiedRows, -1, -1],
];

describe("firstChangedIndexFrom", () => {
  test.each(cases)("%s", (_label, rows, startIdx, expected) => {
    expect(firstChangedIndexFrom(rows, startIdx)).toBe(expected);
  });
});
