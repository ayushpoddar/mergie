import type { CharRange, DiffLine } from "@/domain/diff.ts";

/** One side of a split-view row. */
export interface SplitCell {
  /** Line number on this side, or null for padding. */
  no: number | null;
  /** Line text. */
  text: string;
  /** Cell kind: unchanged, deleted, added, or empty padding. */
  kind: "ctx" | "del" | "add" | "empty";
  /** Intra-line changed character ranges for word highlighting, if any. */
  changes?: CharRange[];
}

/** A single row of the side-by-side split view. */
export interface SplitRow {
  /** Base (left) cell. */
  left: SplitCell;
  /** Head (right) cell. */
  right: SplitCell;
}

/** An empty padding cell. */
const EMPTY: SplitCell = { no: null, text: "", kind: "empty" };

/**
 * Convert a full-file diff's lines into aligned side-by-side rows (GitHub-style
 * split view): context lines appear on both sides; a change block pairs its
 * deleted lines (left) with its added lines (right), padding the shorter side.
 */
export function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];

  const flush = (): void => {
    const n: number = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const d = dels[i];
      const a = adds[i];
      rows.push({
        left: d ? { no: d.oldNo ?? null, text: d.text, kind: "del", changes: d.changes } : EMPTY,
        right: a ? { no: a.newNo ?? null, text: a.text, kind: "add", changes: a.changes } : EMPTY,
      });
    }
    dels = [];
    adds = [];
  };

  for (const line of lines) {
    if (line.kind === "del") dels.push(line);
    else if (line.kind === "add") adds.push(line);
    else {
      flush();
      rows.push({
        left: { no: line.oldNo ?? null, text: line.text, kind: "ctx" },
        right: { no: line.newNo ?? null, text: line.text, kind: "ctx" },
      });
    }
  }
  flush();
  return rows;
}
