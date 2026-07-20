import type { DiffLine } from "@/domain/diff.ts";
import type { DiffSide } from "@/domain/hash.ts";

/** The anchor data for a (possibly multi-line) comment selection. */
export interface LinesAnchor {
  /** Which side the comment is on. */
  side: DiffSide;
  /** Exact head/base text of the selected same-side lines, newline-joined. */
  lineText: string;
  /** First selected line number on the chosen side. */
  lineNo: number;
  /** Last selected line number on the chosen side. */
  endLineNo: number;
}

/** Whether a line participates on a given side. */
function onSide(line: DiffLine, side: DiffSide): boolean {
  return side === "RIGHT" ? line.kind === "add" || line.kind === "ctx" : line.kind === "del" || line.kind === "ctx";
}

/**
 * Derive the comment anchor for a selected range of diff lines. Chooses the
 * head (RIGHT) side unless the selection is deletions only, then joins the
 * text of the selected lines that belong to that side.
 *
 * @returns The anchor, or null if the selection has no line on the chosen side.
 */
export function buildLinesAnchor(lines: DiffLine[], startIdx: number, endIdx: number): LinesAnchor | null {
  const a: number = Math.min(startIdx, endIdx);
  const b: number = Math.max(startIdx, endIdx);
  const selected: DiffLine[] = lines.slice(a, b + 1);
  const hasAdd: boolean = selected.some((l) => l.kind === "add");
  const hasDel: boolean = selected.some((l) => l.kind === "del");
  const side: DiffSide = !hasAdd && hasDel ? "LEFT" : "RIGHT";

  const sideLines: DiffLine[] = selected.filter((l) => onSide(l, side));
  const first: DiffLine | undefined = sideLines[0];
  const last: DiffLine | undefined = sideLines[sideLines.length - 1];
  if (!first || !last) return null;

  const num = (l: DiffLine): number => (side === "RIGHT" ? l.newNo : l.oldNo) ?? 0;
  return {
    side,
    lineText: sideLines.map((l) => l.text).join("\n"),
    lineNo: num(first),
    endLineNo: num(last),
  };
}
