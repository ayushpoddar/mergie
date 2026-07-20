import { useEffect, useRef, useState } from "react";
import { CodePreview } from "./CodePreview.tsx";
import { FileIcon, InfoIcon } from "./Icons.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { filterCodeResults, type CodeResultFilters } from "@/web/lib/filterCodeResults.ts";
import { dedupeResults } from "@/web/lib/dedupeResults.ts";
import { resultCountLabel } from "@/web/lib/resultCountLabel.ts";
import type { CodeResult } from "@/services/symbols.ts";

/** A location to open in a file view. */
export interface OpenLocation {
  /** Repo-relative file path. */
  path: string;
  /** 1-based line to center on. */
  line: number;
  /** Commit SHA the result was found at. */
  sha: string;
}

/** Header context describing what produced the results. */
export interface ResultsHeader {
  /** Human label of the action, e.g. "Definition", "Usages", "Search". */
  op: string;
  /** The looked-up term / query. */
  term: string;
  /** Optional scope label (checkout side, e.g. "head"). */
  scope?: string;
  /** The file the lookup was scoped to ("" / undefined = repo-wide). */
  scopeFile?: string;
}

/** Longer explanation shown in the usages-accuracy tooltip. */
const USAGES_CAVEAT =
  "Usages are found by scanning for references and may be incomplete — re-exports, dynamic calls, and references in other files can be missed. Treat the list as a starting point, not an exhaustive set.";

/**
 * The shared results surface: a header, a filters row, and a keyboard-navigable
 * list of {@link CodePreview} items each with a "View file" action. Results are
 * deduped by `(path, line)` (scopes joined) before display, then narrowed by
 * the active filters with a live count. Handles empty / loading / error states,
 * including a bad-regex message. Reused by the rail Search tab and (Phase D) the
 * navigator results frame.
 */
export function ResultsList(props: {
  /** The raw results to show. */
  results: CodeResult[];
  /** True while a lookup is running. */
  loading: boolean;
  /** A user-facing error, or null. */
  error: string | null;
  /** The active filters (controlled). */
  filters: CodeResultFilters;
  /** Update the filters. */
  onFilters: (f: CodeResultFilters) => void;
  /** The SHA results were found at (passed through to `onOpen`). */
  sha: string;
  /** Header context. */
  header: ResultsHeader;
  /** Open a result's location in a file view. */
  onOpen: (loc: OpenLocation) => void;
  /** Dismiss the surface (Esc). */
  onClose: () => void;
  /** Re-run the lookup repo-wide (shown as "search everywhere" when scoped). */
  onBroaden?: () => void;
}): React.JSX.Element {
  const { results, loading, error, filters, onFilters, sha, header, onOpen, onClose, onBroaden } = props;
  const deduped: CodeResult[] = dedupeResults(results);
  const shown: CodeResult[] = filterCodeResults(deduped, filters);
  const [focus, setFocus] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep focus in range as the filtered list changes.
  useEffect(() => { setFocus((f) => Math.min(f, Math.max(0, shown.length - 1))); }, [shown.length]);

  const open = (r: CodeResult): void => onOpen({ path: r.path, line: r.line, sha });

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(f + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => Math.max(f - 1, 0)); }
    else if (e.key === "Enter") { const r = shown[focus]; if (r) open(r); }
    else if (e.key === "Escape") { onClose(); }
  };

  return (
    <div className="results-list" onKeyDown={onKey} tabIndex={-1}>
      <header className="results-header">
        <strong>{header.op}</strong>
        <code>{header.term}</code>
        {header.scope && <span className="symbol-side-tag">{header.scope}</span>}
        {header.scopeFile && (
          <span className="results-scope">
            in <code>{header.scopeFile}</code>
            {onBroaden && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onBroaden}>Search everywhere</button>
            )}
          </span>
        )}
        <span className="results-count">{resultCountLabel(deduped.length, shown.length)}</span>
      </header>
      {header.op === "Usages" && (
        <p className="results-note">
          <Tooltip label={USAGES_CAVEAT} placement="bottom">
            <button type="button" className="results-note-info" aria-label="About usages accuracy"><InfoIcon size={13} /></button>
          </Tooltip>
          Usages are best-effort — some references may be missing.
        </p>
      )}
      <div className="results-filters">
        <input
          type="text"
          placeholder="Filter by path…"
          value={filters.pathText ?? ""}
          onChange={(e) => onFilters({ ...filters, pathText: e.target.value })}
        />
        <input
          type="text"
          placeholder="Filter by code…"
          value={filters.codeText ?? ""}
          onChange={(e) => onFilters({ ...filters, codeText: e.target.value })}
        />
        <label className="results-toggle">
          <input
            type="checkbox"
            checked={filters.excludeTestsGenerated ?? false}
            onChange={(e) => onFilters({ ...filters, excludeTestsGenerated: e.target.checked })}
          />
          Exclude tests/generated
        </label>
      </div>
      {loading && <div className="diff-loading"><span className="chat-spinner" aria-hidden="true" /> Running…</div>}
      {!loading && error && <p className="notice results-error">{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <div className="empty-state">
          <FileIcon size={32} />
          <p className="empty-state-title">{deduped.length === 0 ? "No results" : "No matches"}</p>
          {deduped.length > 0 && <p className="empty-state-hint">No results match these filters.</p>}
        </div>
      )}
      {!loading && !error && shown.length > 0 && (
        <ul className="results-items" ref={listRef}>
          {shown.map((r, i) => (
            <li
              key={`${r.path}:${r.line}`}
              className={i === focus ? "results-item focused" : "results-item"}
              onMouseEnter={() => setFocus(i)}
            >
              <div className="results-item-loc">
                <code>{r.path}:{r.line}</code>
                {r.scope && <span className="results-item-scope">{r.scope}</span>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => open(r)}>View file</button>
              </div>
              <CodePreview result={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
