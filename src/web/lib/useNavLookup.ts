import { useRef, useState } from "react";
import { trpc } from "@/web/trpc.ts";
import { nextToken, isCurrent } from "@/web/lib/searchToken.ts";
import { fetchResults, errorMessage } from "@/web/lib/codeSearchFetch.ts";
import { frameForLookup } from "@/web/lib/navRouting.ts";
import type { MenuOp, SearchSide } from "@/web/state/useCodeSearch.ts";
import type { NavFrame } from "@/web/lib/navStack.ts";

/** A lookup initiated from a double-click inside a navigator frame. */
export interface NavLookupArgs {
  /** Which lookup to run. */
  op: MenuOp;
  /** The identifier to look up. */
  term: string;
  /** The checkout side to run against. */
  side: SearchSide;
  /** File scope hint (the enclosing file of the selection), or "". */
  file: string;
  /** The SHA to run against (resolved for the chosen side). */
  sha: string;
}

/** The navigator lookup runner: loading/error state + a run action. */
export interface UseNavLookup {
  /** True while a lookup is running (show a loading overlay). */
  loading: boolean;
  /** A user-facing error from the last lookup, or null. */
  error: string | null;
  /** Run a lookup and, on success, push the resolved frame. */
  run: (args: NavLookupArgs) => void;
}

/**
 * Runs symbol/search lookups for the navigator and pushes the resolved frame
 * (via {@link frameForLookup}) when results arrive. Uses the shared
 * {@link fetchResults} path and the {@link searchToken} last-wins race guard so
 * overlapping runs — including StrictMode's double-fire — never push a stale
 * frame. While a run is in flight `loading` is true so the caller can show a
 * loading state instead of a blank frame (also covers the cold-clone wait).
 *
 * @param prId - PR id the lookups run against.
 * @param push - Pushes a frame onto the navigator history.
 */
export function useNavLookup(prId: string, push: (frame: NavFrame) => void): UseNavLookup {
  const utils = trpc.useUtils();
  const token = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (args: NavLookupArgs): void => {
    const id = nextToken(token.current);
    token.current = id;
    setLoading(true);
    setError(null);
    if (args.sha === "" || args.term === "") { setLoading(false); return; }
    void (async () => {
      try {
        const out = await fetchResults(utils, prId, args.sha, {
          mode: args.op === "search" ? "general" : "symbol",
          symbolAction: args.op === "usages" ? "usages" : "definition",
          term: args.term, side: args.side, caseSensitive: false, regex: false,
          file: args.file === "" ? undefined : args.file,
        });
        if (!isCurrent(id, token.current)) return;
        setLoading(false);
        push(frameForLookup(args.op, args.term, args.side, args.sha, out, args.file));
      } catch (err) {
        if (isCurrent(id, token.current)) { setError(errorMessage(err)); setLoading(false); }
      }
    })();
  };

  return { loading, error, run };
}
