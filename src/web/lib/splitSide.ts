import type { SplitRow } from "@/daemon/splitView.ts";

/**
 * Whether one side of a split view carries no content at all — i.e. every cell
 * on that side is empty padding. True for the base side of an added file and
 * the head side of a deleted file, so the modal can show a placeholder instead
 * of a blank column. An empty rows list returns false (there is nothing to lay
 * out yet, e.g. while loading).
 */
export function splitSideIsEmpty(rows: SplitRow[], side: "left" | "right"): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => r[side].kind === "empty");
}
