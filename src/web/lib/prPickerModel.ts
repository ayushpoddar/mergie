/** The identity fields shared by loaded PRs and GitHub search results. */
export interface PrIdentity {
  /** Repository owner / organisation. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Pull request number. */
  number: number;
}

/** A stable `owner/repo#number` key for deduping across sources. */
export function prKey(pr: PrIdentity): string {
  return `${pr.owner}/${pr.repo}#${pr.number}`;
}

/**
 * Remove search results that already appear in the loaded set (matched by
 * {@link prKey}), so the "From GitHub" section never repeats a PR shown under
 * "Recently reviewed". Inputs are not mutated.
 */
export function excludeLoaded<T extends PrIdentity>(
  search: readonly T[],
  loaded: readonly PrIdentity[],
): T[] {
  const loadedKeys = new Set<string>(loaded.map(prKey));
  return search.filter((pr) => !loadedKeys.has(prKey(pr)));
}
