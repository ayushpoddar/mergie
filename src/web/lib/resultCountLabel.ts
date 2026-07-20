/**
 * A short count label for a results header. When every result is shown it
 * reads "N result(s)"; when a filter hides some it reads "showing X of Y".
 *
 * @param total - The total number of results before filtering.
 * @param shown - The number of results currently shown after filtering.
 */
export function resultCountLabel(total: number, shown: number): string {
  if (shown < total) return `showing ${shown} of ${total}`;
  return `${total} ${total === 1 ? "result" : "results"}`;
}
