/** Characters that mark a "word boundary" in a path/filename. */
const BOUNDARY = new Set(["/", "_", "-", ".", " "]);

/**
 * Score how well `query` fuzzy-matches `target` (case-insensitive subsequence).
 * Higher is better; contiguous runs and matches at word boundaries score more.
 *
 * @returns The score, or `null` if `query` is not a subsequence of `target`.
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (query.length === 0) return 0;
  const q: string = query.toLowerCase();
  const t: string = target.toLowerCase();

  let score = 0;
  let qi = 0;
  let prevMatch = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    score += 1;
    if (ti === prevMatch + 1) score += 8; // contiguous run (weighted above boundaries)
    if (ti === 0 || BOUNDARY.has(t[ti - 1] ?? "")) score += 6; // word boundary
    prevMatch = ti;
    qi++;
  }
  return qi === q.length ? score : null;
}

/**
 * Filter and rank items by fuzzy match against `query`. An empty query returns
 * the items unchanged; otherwise non-matches are dropped and matches are sorted
 * by score (desc), breaking ties by shorter item then original order.
 */
export function fuzzyFilter(query: string, items: readonly string[]): string[] {
  if (query.length === 0) return [...items];
  const scored: Array<{ item: string; score: number; index: number }> = [];
  items.forEach((item, index) => {
    const score = fuzzyScore(query, item);
    if (score !== null) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.item.length - b.item.length || a.index - b.index);
  return scored.map((s) => s.item);
}
