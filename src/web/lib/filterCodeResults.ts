import type { CodeResult } from "@/services/symbols.ts";

/** Client-side filter options for a list of code results. */
export interface CodeResultFilters {
  /** Case-insensitive substring the file path must contain. */
  pathText?: string;
  /**
   * Case-insensitive substring the code must contain — matched against the
   * matched line, the definition body, and the before/after context lines.
   */
  codeText?: string;
  /** When true, drop results the backend flagged as test/generated. */
  excludeTestsGenerated?: boolean;
}

/** Whether any of a result's code text contains `needle` (case-insensitive). */
function codeContains(r: CodeResult, needle: string): boolean {
  const haystacks: string[] = [r.matched, r.body ?? "", ...r.before, ...r.after];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

/**
 * Filter code results by path substring, code substring, and an
 * exclude-tests/generated toggle. All active filters combine with AND.
 * Purely derives a new array; never mutates the input.
 *
 * @param results - The full result list.
 * @param filters - The active filter options (any subset).
 */
export function filterCodeResults(
  results: readonly CodeResult[],
  filters: CodeResultFilters,
): CodeResult[] {
  const pathNeedle = filters.pathText?.toLowerCase() ?? "";
  const codeNeedle = filters.codeText?.toLowerCase() ?? "";
  return results.filter((r) => {
    if (filters.excludeTestsGenerated === true && r.testOrGenerated) return false;
    if (pathNeedle !== "" && !r.path.toLowerCase().includes(pathNeedle)) return false;
    if (codeNeedle !== "" && !codeContains(r, codeNeedle)) return false;
    return true;
  });
}
