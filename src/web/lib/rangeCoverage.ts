/** Inputs for computing a range-coverage label. */
export interface RangeCoverage {
  /** Index of the first included commit (0-based, oldest = 0). */
  fromIndex: number;
  /** Index of the last included commit (0-based). */
  toIndex: number;
  /** Total number of commits in the PR. */
  total: number;
}

/** Pluralise "commit" for a count. */
function commitWord(n: number): string {
  return n === 1 ? "commit" : "commits";
}

/**
 * A compact label describing how much of the PR a commit selection covers, for
 * the range-selector pill. When the selection spans the whole PR
 * (`fromIndex === 0` and `toIndex === total - 1`) it reads "All {total}
 * commit(s)"; otherwise "{K} of {total} commits" where K is the selected count.
 */
export function rangeCoverageLabel(cov: RangeCoverage): string {
  const selected: number = cov.toIndex - cov.fromIndex + 1;
  const isFull: boolean = cov.fromIndex === 0 && cov.toIndex === cov.total - 1;
  if (isFull) return `All ${cov.total} ${commitWord(cov.total)}`;
  return `${selected} of ${cov.total} ${commitWord(cov.total)}`;
}
