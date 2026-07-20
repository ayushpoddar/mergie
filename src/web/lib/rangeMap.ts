/** An inclusive commit selection: first and last commit index to include. */
export interface InclusiveSel {
  /** Index (in the commits array) of the first included commit. */
  fromIndex: number;
  /** Index of the last included commit. */
  toIndex: number;
}

/** An exclusive commit range (diff = start→end, start excluded). */
export interface ExclusiveRange {
  /** Baseline SHA (excluded). */
  start: string;
  /** End SHA (included). */
  end: string;
}

/** Clamp a number into [min, max]. */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Convert an exclusive range into an inclusive selection (first/last included
 * commit indices) for display. The exclusive `start` is the commit *before*
 * the first included commit (or the baseline).
 */
export function toInclusive(range: ExclusiveRange, commits: string[], baselineSha: string): InclusiveSel {
  const fromIndex: number = range.start === baselineSha ? 0 : commits.indexOf(range.start) + 1;
  const toIndex: number = commits.indexOf(range.end);
  return { fromIndex: clamp(fromIndex, 0, commits.length - 1), toIndex: clamp(toIndex, 0, commits.length - 1) };
}

/**
 * Convert an inclusive selection back into an exclusive range for the API.
 * `fromIndex` above `toIndex` is clamped to a single commit.
 */
export function toRange(sel: InclusiveSel, commits: string[], baselineSha: string): ExclusiveRange {
  const to: number = clamp(sel.toIndex, 0, commits.length - 1);
  const from: number = clamp(sel.fromIndex, 0, to);
  const start: string = from === 0 ? baselineSha : (commits[from - 1] ?? baselineSha);
  return { start, end: commits[to] ?? baselineSha };
}
