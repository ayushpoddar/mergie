import { useRef, useState } from "react";
import { trpc } from "../trpc.ts";
import { nextToken, isCurrent } from "@/web/lib/searchToken.ts";
import { fetchResults, errorMessage, type RunParams } from "@/web/lib/codeSearchFetch.ts";
import { searchInputsKey } from "@/web/lib/searchInputsKey.ts";
import type { CodeResult } from "@/services/symbols.ts";
import type { CodeResultFilters } from "@/web/lib/filterCodeResults.ts";

/** Search mode: a free-text search vs a semantic symbol lookup. */
export type SearchMode = "general" | "symbol";

/** Which symbol lookup to run in symbol mode. */
export type SymbolAction = "definition" | "usages";

/** Which checkout to run against: the range's head (end) or base (start). */
export type SearchSide = "head" | "base";

/**
 * A snapshot of the inputs a run used. Drives the results header (which stays
 * frozen on the last run rather than tracking the live controls) and the
 * "broaden to the whole repo" action.
 */
export interface RunSnapshot {
  /** Mode the run used. */
  mode: SearchMode;
  /** Symbol lookup the run used (relevant in symbol mode). */
  symbolAction: SymbolAction;
  /** The term/query the run used. */
  term: string;
  /** The checkout side the run targeted. */
  side: SearchSide;
  /** The file the run was scoped to ("" = repo-wide). */
  scopeFile: string;
}

/** SHA getters for the two ends of the current review range. */
export interface ShaGetters {
  /** Current head (end) SHA of the range, or "" when unset. */
  headSha: () => string;
  /** Current base (start) SHA of the range, or "" when unset. */
  baseSha: () => string;
}

/** The full code-search rail state plus its actions. */
export interface CodeSearchState {
  /** General text search vs semantic symbol lookup. */
  mode: SearchMode;
  /** The query / symbol term in the input. */
  query: string;
  /** General mode: case-sensitive matching. */
  caseSensitive: boolean;
  /** General mode: treat the query as a regex. */
  regex: boolean;
  /** Symbol mode: which lookup to run. */
  symbolAction: SymbolAction;
  /** Which checkout the next/last run targets. */
  side: SearchSide;
  /** The SHA the last completed run resolved to (for opening file views). */
  resultSha: string;
  /** The last run's results (deduping is done in the view). */
  results: CodeResult[];
  /** True while a lookup is running. */
  loading: boolean;
  /** A user-facing error from the last run (e.g. bad regex), or null. */
  error: string | null;
  /**
   * Whether the current inputs differ from the last run (so the shown results
   * are stale and "Run" should be pressed). False before the first run when the
   * query is empty.
   */
  dirty: boolean;
  /**
   * The inputs the last run used, or null before the first run. The results
   * header reads this (not the live controls) so it only changes on Run.
   */
  lastRun: RunSnapshot | null;
  /** The active client-side result filters. */
  filters: CodeResultFilters;
  /** Update the query text. */
  setQuery: (q: string) => void;
  /** Switch search mode. */
  setMode: (m: SearchMode) => void;
  /** Toggle case-sensitive (general mode). */
  setCaseSensitive: (v: boolean) => void;
  /** Toggle regex (general mode). */
  setRegex: (v: boolean) => void;
  /** Switch the symbol lookup (symbol mode). */
  setSymbolAction: (a: SymbolAction) => void;
  /** Switch the target checkout. */
  setSide: (s: SearchSide) => void;
  /** Replace the active filters. */
  setFilters: (f: CodeResultFilters) => void;
  /** Run the current query as configured by the rail controls. */
  runFromRail: () => void;
  /**
   * Run a lookup initiated from the diff double-click menu: sets the state to
   * match the picked action/term/side (+ file scope hint) and runs it.
   */
  runFromMenu: (op: MenuOp, term: string, side: SearchSide, file: string) => void;
  /**
   * Re-run the last (file-scoped) lookup across the whole repo, dropping the
   * file scope. A no-op when the last run was already repo-wide.
   */
  broaden: () => void;
}

/** The operation a double-click menu can pick. */
export type MenuOp = "definition" | "usages" | "search";

/**
 * The code-search rail state: holds the query + mode + toggles + filters, runs
 * general (rg) searches and symbol (sem) definition/usages lookups against the
 * chosen checkout, and surfaces loading/error/results. A monotonic request
 * token drops results from superseded runs (last-wins) so overlapping async
 * work — including StrictMode's double-fire — never shows stale results.
 *
 * @param prId - The PR id lookups run against.
 * @param shas - Getters for the current head/base SHAs of the review range.
 */
export function useCodeSearch(prId: string, shas: ShaGetters): CodeSearchState {
  const utils = trpc.useUtils();
  const token = useRef(0);
  const [mode, setMode] = useState<SearchMode>("general");
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [symbolAction, setSymbolAction] = useState<SymbolAction>("definition");
  const [side, setSide] = useState<SearchSide>("head");
  const [resultSha, setResultSha] = useState("");
  const [results, setResults] = useState<CodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CodeResultFilters>({});
  // Key of the inputs the last run used, so the view can flag stale results.
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  // The inputs the last run used — the header reads this so it only changes on Run.
  const [lastRun, setLastRun] = useState<RunSnapshot | null>(null);

  const run = async (p: RunParams): Promise<void> => {
    const id = nextToken(token.current);
    token.current = id;
    const sha: string = p.side === "base" ? shas.baseSha() : shas.headSha();
    setLastRunKey(searchInputsKey({
      mode: p.mode, query: p.term, caseSensitive: p.caseSensitive,
      regex: p.regex, symbolAction: p.symbolAction, side: p.side,
    }));
    setLastRun({ mode: p.mode, symbolAction: p.symbolAction, term: p.term, side: p.side, scopeFile: p.file ?? "" });
    setLoading(true);
    setError(null);
    if (sha === "" || p.term === "") {
      if (isCurrent(id, token.current)) { setLoading(false); setResults([]); }
      return;
    }
    try {
      const out = await fetchResults(utils, prId, sha, p);
      if (isCurrent(id, token.current)) { setResults(out); setResultSha(sha); setLoading(false); }
    } catch (err) {
      if (isCurrent(id, token.current)) { setResults([]); setError(errorMessage(err)); setLoading(false); }
    }
  };

  const runFromRail = (): void => {
    void run({ mode, symbolAction, term: query.trim(), side, caseSensitive, regex });
  };

  const currentKey: string = searchInputsKey({ mode, query, caseSensitive, regex, symbolAction, side });
  const dirty: boolean = query.trim() !== "" && currentKey !== lastRunKey;

  return {
    mode, query, caseSensitive, regex, symbolAction, side, resultSha, results, loading, error, dirty, lastRun, filters,
    setQuery, setMode, setCaseSensitive, setRegex, setSymbolAction, setSide, setFilters,
    runFromRail,
    broaden: () => {
      if (!lastRun || lastRun.scopeFile === "") return;
      void run({
        mode: lastRun.mode, symbolAction: lastRun.symbolAction, term: lastRun.term,
        side: lastRun.side, caseSensitive, regex, file: undefined,
      });
    },
    runFromMenu: (op, term, side_, file) => {
      const nextMode: SearchMode = op === "search" ? "general" : "symbol";
      const nextAction: SymbolAction = op === "usages" ? "usages" : "definition";
      setMode(nextMode);
      setSide(side_);
      setQuery(term);
      if (op !== "search") setSymbolAction(nextAction);
      void run({
        mode: nextMode,
        symbolAction: nextAction,
        term,
        side: side_,
        caseSensitive,
        regex,
        file: file === "" ? undefined : file,
      });
    },
  };
}
