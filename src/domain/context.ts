/** The `matched` line plus up to `n` context lines on each side. */
export interface ContextSlice {
  /** Up to `n` lines before `matched`, top-to-bottom (clamped at file start). */
  before: string[];
  /** The matched line's text; empty string when `line` is out of range. */
  matched: string;
  /** Up to `n` lines after `matched`, top-to-bottom (clamped at file end). */
  after: string[];
}

/**
 * Slice `n` lines of context around a 1-based `line` within `lines`.
 * Out-of-range lines yield an empty `matched` and no context.
 * @param lines - The file's lines (0-based array, 1-based `line`).
 * @param line - 1-based line number to centre on.
 * @param n - Number of context lines to include on each side.
 */
export function sliceContext(
  lines: readonly string[],
  line: number,
  n: number,
): ContextSlice {
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) {
    return { before: [], matched: "", after: [] };
  }
  return {
    before: lines.slice(Math.max(0, idx - n), idx),
    matched: lines[idx] ?? "",
    after: lines.slice(idx + 1, idx + 1 + n),
  };
}
