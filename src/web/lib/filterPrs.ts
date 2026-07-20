/** The minimal PR shape the picker filter needs. */
export interface FilterablePr {
  /** Repository owner / organisation. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Pull request number. */
  number: number;
  /** PR title. */
  title: string;
  /** GitHub login of the author (absent for already-loaded PRs). */
  author?: string;
}

/**
 * Case-insensitively filter PRs by a free-text query. A PR matches when the
 * query (trimmed) is a substring of any of: `owner`, `repo`, `owner/repo`, the
 * title, the author, or the number (with or without a leading `#`). A blank
 * query returns every PR. The input array is never mutated.
 */
export function filterPrs<T extends FilterablePr>(query: string, prs: readonly T[]): T[] {
  const q: string = query.trim().toLowerCase();
  if (q.length === 0) return [...prs];
  return prs.filter((pr) => haystack(pr).some((field) => field.includes(q)));
}

/** All lowercased fields of a PR that the query is tested against. */
function haystack(pr: FilterablePr): string[] {
  return [
    pr.owner,
    pr.repo,
    `${pr.owner}/${pr.repo}`,
    pr.title,
    pr.author ?? "",
    `#${pr.number}`,
    String(pr.number),
  ].map((f) => f.toLowerCase());
}
