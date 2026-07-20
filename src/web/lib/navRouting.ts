import type { CodeResult } from "@/services/symbols.ts";
import type { MenuOp, SearchSide } from "@/web/state/useCodeSearch.ts";
import type { NavFrame } from "./navStack.ts";

/** Human label for a lookup op, for the results-frame header. */
export function opLabel(op: MenuOp): string {
  if (op === "search") return "Search";
  return op === "usages" ? "Usages" : "Definition";
}

/**
 * The frame to push after a lookup completes. An *unscoped* single-result
 * Definition jumps straight to the definition (a `file` frame); everything else
 * — Usages, Search, multi- or zero-result Definition, and any *scoped* lookup —
 * shows the shared results list (a `results` frame, which renders the empty
 * state and the scope chip + broaden action). A scoped single-result Definition
 * deliberately stays a results frame so the "search everywhere" broaden control
 * is reachable.
 *
 * @param op - The lookup op that ran.
 * @param term - The looked-up term / query.
 * @param side - The checkout side the lookup ran against.
 * @param sha - The SHA the results were found at.
 * @param results - The results returned.
 * @param file - The file the lookup was scoped to ("" means repo-wide).
 */
export function frameForLookup(
  op: MenuOp,
  term: string,
  side: SearchSide,
  sha: string,
  results: CodeResult[],
  file: string,
): NavFrame {
  if (op === "definition" && results.length === 1 && file === "") {
    const r = results[0]!;
    return { kind: "file", path: r.path, sha, line: r.line };
  }
  return { kind: "results", op, term, side, sha, scopeFile: file, results };
}
