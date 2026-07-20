/**
 * Pure heuristic: does a repo-relative path look like test code?
 *
 * Matches a `__tests__/` directory, a `.test.`/`.spec.` filename infix, or a
 * `test/` or `tests/` path segment. Segment matching is anchored on `/`
 * boundaries so `latest/`, `contest/`, or `spectacular.ts` do NOT match.
 *
 * @param path - Repository-relative file path (forward-slash separated).
 */
export function isTestPath(path: string): boolean {
  return (
    path.includes("__tests__/") ||
    path.includes(".test.") ||
    path.includes(".spec.") ||
    /(^|\/)tests?\//.test(path)
  );
}

/**
 * Whether a result's file should be treated as test/generated (hideable via
 * the UI's "exclude tests & generated" toggle). Combines the caller-supplied
 * lockfile/generated verdict (which uses backend glob patterns) with the pure
 * test-path heuristic.
 *
 * @param path - Repository-relative file path.
 * @param isLockfileOrGenerated - Result of the backend lockfile-glob matcher.
 */
export function isTestOrGenerated(
  path: string,
  isLockfileOrGenerated: boolean,
): boolean {
  return isLockfileOrGenerated || isTestPath(path);
}
