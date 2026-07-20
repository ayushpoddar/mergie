/** An inclusive, 1-based line span `[start, end]`. */
export type Span = [number, number];

/** Escape a string for safe use as a literal inside a RegExp. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the 1-based line numbers within `span` where `symbol` appears as a
 * whole word (word-boundary match). A `symbol` that is only a substring of a
 * longer identifier (e.g. `foo` inside `fooBar`) does NOT match.
 *
 * The span is inclusive and 1-based; it is clamped to the file's bounds.
 *
 * @param lines - The file's lines (0-based array, 1-based line numbers).
 * @param span - Inclusive `[start, end]` line range to search within.
 * @param symbol - The identifier to look for.
 * @returns Ascending, de-duplicated line numbers containing a real reference.
 */
export function findReferences(
  lines: readonly string[],
  span: Span,
  symbol: string,
): number[] {
  const [start, end] = span;
  const from = Math.max(1, start);
  const to = Math.min(lines.length, end);
  const pattern = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
  const hits: number[] = [];
  for (let line = from; line <= to; line++) {
    const text = lines[line - 1];
    if (text !== undefined && pattern.test(text)) hits.push(line);
  }
  return hits;
}
