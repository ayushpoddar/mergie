import type { CharRange, DiffLine } from "./diff.ts";

export type { CharRange };

/** The intra-line changed ranges for one file, keyed by absolute line number. */
export interface FileWordChanges {
  /** Base-side path (`a/…`). */
  oldPath: string;
  /** Head-side path (`b/…`). */
  newPath: string;
  /** Base-side changed ranges by 1-based old line number (only changed lines). */
  oldByLine: Map<number, CharRange[]>;
  /** Head-side changed ranges by 1-based new line number (only changed lines). */
  newByLine: Map<number, CharRange[]>;
}

/**
 * Ratio of a line's characters that must have changed before we treat it as a
 * near-total rewrite and drop word highlighting (falling back to the plain
 * line background). Also naturally suppresses pure insertions/deletions, whose
 * whole line reads as changed.
 */
const NEAR_TOTAL_REWRITE_RATIO = 0.6;

/** One porcelain segment within a reconstructed line. */
interface Segment {
  /** Which side(s) the text belongs to. */
  kind: "common" | "old" | "new";
  /** The segment's literal text (marker prefix already stripped). */
  text: string;
}

/**
 * Parse `git diff --word-diff=porcelain` output into per-file, per-line changed
 * character ranges. Pure — performs no git or filesystem access.
 *
 * Porcelain emits a token stream: lines prefixed ` ` (common), `-` (base only),
 * `+` (head only), and a bare `~` marking a source newline. A block (the
 * segments since the last `~`) advances the base line number if it holds any
 * common/`-` segment, and the head line number if it holds any common/`+`
 * segment — so pure insertions advance only the head side and pure deletions
 * only the base side.
 */
export function parseWordDiff(text: string): FileWordChanges[] {
  const files: FileWordChanges[] = [];
  let current: FileWordChanges | null = null;
  let oldNo = 0;
  let newNo = 0;
  let block: Segment[] = [];

  const flush = (): void => {
    if (!current) { block = []; return; }
    applyBlock(current, block, oldNo, newNo, (o, n) => { oldNo = o; newNo = n; });
    block = [];
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = startFile(line);
      if (current) files.push(current);
    } else if (line.startsWith("@@ ")) {
      flush();
      const header = parseAtAt(line);
      if (header) { oldNo = header.oldStart; newNo = header.newStart; }
    } else if (line === "~") {
      flush();
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — not part of the content.
    } else if (current && (line.startsWith(" ") || line.startsWith("-") || line.startsWith("+"))) {
      block.push({ kind: markerKind(line[0]), text: line.slice(1) });
    }
  }
  flush();
  return files;
}

/** Start a new file accumulator from a `diff --git a/… b/…` line. */
function startFile(line: string): FileWordChanges | null {
  const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (!m) return null;
  return { oldPath: m[1] ?? "", newPath: m[2] ?? "", oldByLine: new Map(), newByLine: new Map() };
}

/** Parse an `@@ -a,b +c,d @@` header into its 1-based start line numbers. */
function parseAtAt(header: string): { oldStart: number; newStart: number } | null {
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  if (!m) return null;
  return { oldStart: Number(m[1]), newStart: Number(m[2]) };
}

/** Map a porcelain marker character to a segment kind. */
function markerKind(marker: string | undefined): Segment["kind"] {
  if (marker === "-") return "old";
  if (marker === "+") return "new";
  return "common";
}

/**
 * Fold one `~`-terminated block into `current`, recording changed ranges and
 * advancing whichever side(s) the block participates in.
 */
function applyBlock(
  current: FileWordChanges,
  block: Segment[],
  oldNo: number,
  newNo: number,
  advance: (oldNo: number, newNo: number) => void,
): void {
  const { oldRanges, newRanges, hasOld, hasNew } = reduceBlock(block);
  if (hasOld) {
    if (oldRanges.length > 0) current.oldByLine.set(oldNo, oldRanges);
    oldNo += 1;
  }
  if (hasNew) {
    if (newRanges.length > 0) current.newByLine.set(newNo, newRanges);
    newNo += 1;
  }
  advance(oldNo, newNo);
}

/** Reconstruct a block's base/head text offsets and changed ranges. */
function reduceBlock(block: Segment[]): {
  oldRanges: CharRange[];
  newRanges: CharRange[];
  hasOld: boolean;
  hasNew: boolean;
} {
  const oldRanges: CharRange[] = [];
  const newRanges: CharRange[] = [];
  let oldLen = 0;
  let newLen = 0;
  let hasOld = block.length === 0;
  let hasNew = block.length === 0;
  for (const seg of block) {
    const len = seg.text.length;
    if (seg.kind === "common") {
      oldLen += len; newLen += len; hasOld = true; hasNew = true;
    } else if (seg.kind === "old") {
      oldRanges.push({ start: oldLen, end: oldLen + len }); oldLen += len; hasOld = true;
    } else {
      newRanges.push({ start: newLen, end: newLen + len }); newLen += len; hasNew = true;
    }
  }
  return { oldRanges, newRanges, hasOld, hasNew };
}

/**
 * Attach word-diff ranges to each line of a file's structural diff, keyed by
 * side + line number, dropping ranges for near-total rewrites. Returns a new
 * array; never mutates the input.
 */
export function withWordChanges(lines: DiffLine[], changes: FileWordChanges | undefined): DiffLine[] {
  if (!changes) return lines;
  return lines.map((line) => {
    const ranges = rangesFor(line, changes);
    if (ranges.length === 0 || isNearTotal(ranges, line.text.length)) return line;
    return { ...line, changes: ranges };
  });
}

/** The changed ranges recorded for a line's side, or an empty list. */
function rangesFor(line: DiffLine, changes: FileWordChanges): CharRange[] {
  if (line.kind === "del" && line.oldNo !== undefined) return changes.oldByLine.get(line.oldNo) ?? [];
  if (line.kind === "add" && line.newNo !== undefined) return changes.newByLine.get(line.newNo) ?? [];
  return [];
}

/** Whether the changed ranges cover at least the near-total-rewrite ratio. */
function isNearTotal(ranges: CharRange[], length: number): boolean {
  if (length <= 0) return true;
  const changed = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  return changed / length >= NEAR_TOTAL_REWRITE_RATIO;
}
