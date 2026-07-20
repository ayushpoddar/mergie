import type { SplitRow } from "@/daemon/splitView.ts";

/** Whether a split row represents a change (either side is not a context cell). */
function isChangedRow(row: SplitRow): boolean {
  return row.left.kind !== "ctx" || row.right.kind !== "ctx";
}

/**
 * Index of the first changed row (an addition/deletion, i.e. a row where a side
 * is `add`/`del`/`empty` rather than `ctx`) at or after `startIdx`. Used to move
 * the full-file modal's anchor highlight off the context line it was opened at
 * (e.g. a `}`) and onto the real +/- line just below.
 *
 * Falls back to `startIdx` unchanged when there is no changed row at/after it —
 * including a negative `startIdx` (no anchor) — so the caller never jumps to the
 * top or crashes.
 */
export function firstChangedIndexFrom(rows: SplitRow[], startIdx: number): number {
  if (startIdx < 0) return startIdx;
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (row && isChangedRow(row)) return i;
  }
  return startIdx;
}
