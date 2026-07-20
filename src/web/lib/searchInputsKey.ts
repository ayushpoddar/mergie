import type { SearchMode, SymbolAction, SearchSide } from "@/web/state/useCodeSearch.ts";

/** The run-relevant search inputs whose change makes results stale. */
export interface SearchInputs {
  /** General text search vs semantic symbol lookup. */
  mode: SearchMode;
  /** The query / symbol term (compared trimmed). */
  query: string;
  /** General mode: case-sensitive matching. */
  caseSensitive: boolean;
  /** General mode: regex matching. */
  regex: boolean;
  /** Symbol mode: which lookup. */
  symbolAction: SymbolAction;
  /** Target checkout side. */
  side: SearchSide;
}

/**
 * A stable string identifying a set of search inputs. Two input sets produce
 * the same key iff running them would issue the same query, so the UI can tell
 * when the current inputs have drifted from the last run (results are stale and
 * "Run" should be pressed). The query is trimmed so trailing whitespace alone
 * is not treated as a change.
 */
export function searchInputsKey(inputs: SearchInputs): string {
  return JSON.stringify([
    inputs.mode,
    inputs.query.trim(),
    inputs.caseSensitive,
    inputs.regex,
    inputs.symbolAction,
    inputs.side,
  ]);
}
