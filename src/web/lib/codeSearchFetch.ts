import type { trpc } from "@/web/trpc.ts";
import { BadRegexError, type CodeResult } from "@/services/symbols.ts";
import type { SearchMode, SymbolAction, SearchSide } from "@/web/state/useCodeSearch.ts";

/** The tRPC utils object (`trpc.useUtils()`), used for imperative fetches. */
export type TrpcUtils = ReturnType<typeof trpc.useUtils>;

/** Parameters resolved for one lookup run. */
export interface RunParams {
  /** Search mode to run in. */
  mode: SearchMode;
  /** Symbol lookup (used only in symbol mode). */
  symbolAction: SymbolAction;
  /** The term/query to run. */
  term: string;
  /** The checkout side to run against. */
  side: SearchSide;
  /** Case-sensitive (general mode). */
  caseSensitive: boolean;
  /** Regex (general mode). */
  regex: boolean;
  /** Optional file scope hint for symbol lookups. */
  file?: string;
}

/**
 * Fetch results for one resolved run via the tRPC utils. The single place the
 * symbol/search tRPC procedures are called, so the rail and the navigator share
 * one fetch path.
 */
export async function fetchResults(utils: TrpcUtils, prId: string, sha: string, p: RunParams): Promise<CodeResult[]> {
  if (p.mode === "general") {
    return utils.symbolSearch.fetch({ id: prId, word: p.term, sha, caseSensitive: p.caseSensitive, regex: p.regex });
  }
  if (p.symbolAction === "usages") {
    return utils.symbolUsages.fetch({ id: prId, symbol: p.term, sha, file: p.file });
  }
  return utils.symbolDefinition.fetch({ id: prId, symbol: p.term, sha, file: p.file });
}

/** A human message for a lookup error (bad regex vs generic failure). */
export function errorMessage(err: unknown): string {
  if (err instanceof BadRegexError) return err.message;
  if (err instanceof Error && /regex|pattern/i.test(err.message)) return "Invalid search pattern.";
  return "Search failed. Please try again.";
}
