/** A pull request's commit topology for range resolution. */
export interface PrCommits {
  /** The "before-PR" baseline (merge-base with target); a valid range start. */
  baselineSha: string;
  /** PR commit SHAs, ordered oldest → newest. */
  commits: string[];
}

/** A range the user has marked reviewed. */
export interface ReviewedRange {
  /** Range start SHA (excluded baseline). */
  startSha: string;
  /** Range end SHA. */
  endSha: string;
  /** Creation timestamp (ms) — used to find the most recent. */
  createdAt: number;
}

/** A commit range: diff is startSha → endSha (start excluded). */
export interface Range {
  /** Baseline SHA (its own changes are excluded). */
  startSha: string;
  /** End SHA (inclusive). */
  endSha: string;
}

/** All SHAs that are valid range endpoints for a PR. */
function knownShas(pr: PrCommits): Set<string> {
  return new Set<string>([pr.baselineSha, ...pr.commits]);
}

/** Ordinal position of a SHA (baseline = -1, commits 0..n-1); -Infinity if unknown. */
function ordinal(sha: string, pr: PrCommits): number {
  if (sha === pr.baselineSha) return -1;
  const idx: number = pr.commits.indexOf(sha);
  return idx === -1 ? Number.NEGATIVE_INFINITY : idx;
}

/** The head (latest) SHA of the PR. */
function headSha(pr: PrCommits): string {
  return pr.commits.at(-1) ?? pr.baselineSha;
}

/**
 * Resolve the range shown when a PR first opens: the most recently reviewed
 * range's end → head. If no non-stale reviewed range exists, the whole PR
 * (baseline → head).
 */
export function resolveDefaultRange(pr: PrCommits, reviewed: ReviewedRange[]): Range {
  const head: string = headSha(pr);
  const known: Set<string> = knownShas(pr);
  const latestValid: ReviewedRange | undefined = [...reviewed]
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((r) => known.has(r.endSha));
  return { startSha: latestValid?.endSha ?? pr.baselineSha, endSha: head };
}

/**
 * True if the exact range (both endpoints) has already been marked reviewed.
 * Used to reflect reviewed status on the "mark reviewed" control, since
 * re-marking an already-reviewed range is a silent no-op.
 */
export function isRangeReviewed(range: Range, reviewed: ReviewedRange[]): boolean {
  return reviewed.some((r) => r.startSha === range.startSha && r.endSha === range.endSha);
}

/** True if either endpoint of a range is no longer present in the PR. */
export function isStale(range: Range, pr: PrCommits): boolean {
  const known: Set<string> = knownShas(pr);
  return !known.has(range.startSha) || !known.has(range.endSha);
}

/**
 * Validate a candidate range: both endpoints must exist and start must come
 * strictly before end in commit order.
 */
export function isValidRange(startSha: string, endSha: string, pr: PrCommits): boolean {
  const known: Set<string> = knownShas(pr);
  if (!known.has(startSha) || !known.has(endSha)) return false;
  return ordinal(startSha, pr) < ordinal(endSha, pr);
}
