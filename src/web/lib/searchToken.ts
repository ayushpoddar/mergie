/**
 * Last-wins race-guard primitives for asynchronous lookups.
 *
 * Every run issues a fresh, monotonically increasing token. When a request's
 * results arrive, they are applied only if their token still matches the latest
 * issued one; results from a request that has since been superseded are
 * dropped. This makes overlapping/duplicated async runs safe — necessary under
 * React.StrictMode, where effects and async work double-fire in development.
 */

/** Issue the next request token after `current` (starts at 1). */
export function nextToken(current: number): number {
  return current + 1;
}

/**
 * Whether a result tagged with `resultToken` should be applied given that
 * `latestToken` is the most recently issued request.
 *
 * @param resultToken - The token the completed request was tagged with.
 * @param latestToken - The token of the most recent request that was issued.
 */
export function isCurrent(resultToken: number, latestToken: number): boolean {
  return resultToken === latestToken;
}
