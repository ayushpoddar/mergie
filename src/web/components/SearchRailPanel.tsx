import { ResultsList, type OpenLocation, type ResultsHeader } from "./ResultsList.tsx";
import { Tooltip } from "./Tooltip.tsx";
import type { FileTarget } from "./FileView.tsx";
import type { CodeSearchState, RunSnapshot } from "../state/useCodeSearch.ts";

/** Human label for a run's lookup, for the results header. */
function opLabel(run: Pick<RunSnapshot, "mode" | "symbolAction">): string {
  if (run.mode === "general") return "Search";
  return run.symbolAction === "usages" ? "Usages" : "Definition";
}

/** One segmented pill, wrapped in the app's hover Tooltip (matches the icon rail). */
function Pill(props: { label: string; tip: string; active: boolean; onClick: () => void }): React.JSX.Element {
  const { label, tip, active, onClick } = props;
  return (
    <Tooltip label={tip} placement="bottom">
      <button type="button" className={active ? "segmented-item active" : "segmented-item"} aria-pressed={active} onClick={onClick}>{label}</button>
    </Tooltip>
  );
}

/** General|Symbol mode segmented toggle. */
function ModeToggle(props: { state: CodeSearchState }): React.JSX.Element {
  const { state } = props;
  return (
    <div className="segmented" role="group" aria-label="Search mode">
      <Pill label="General" tip="Plain-text search across the code (ripgrep)." active={state.mode === "general"} onClick={() => state.setMode("general")} />
      <Pill label="Symbol" tip="Look up a symbol semantically — its definition or usages." active={state.mode === "symbol"} onClick={() => state.setMode("symbol")} />
    </div>
  );
}

/** Definition|Usages segmented toggle (symbol mode). */
function ActionToggle(props: { state: CodeSearchState }): React.JSX.Element {
  const { state } = props;
  return (
    <div className="segmented" role="group" aria-label="Symbol lookup">
      <Pill label="Definition" tip="Find where the symbol is defined (lists all matching definitions)." active={state.symbolAction === "definition"} onClick={() => state.setSymbolAction("definition")} />
      <Pill label="Usages" tip="Find where the symbol is referenced. Best-effort — some references may be missed." active={state.symbolAction === "usages"} onClick={() => state.setSymbolAction("usages")} />
    </div>
  );
}

/** Head|Base segmented toggle. */
function SideToggle(props: { state: CodeSearchState }): React.JSX.Element {
  const { state } = props;
  return (
    <div className="segmented" role="group" aria-label="Checkout side">
      <Pill label="Head" tip="Search the head version — the code at the end of the selected commit range." active={state.side === "head"} onClick={() => state.setSide("head")} />
      <Pill label="Base" tip="Search the base version — the code at the start of the selected commit range." active={state.side === "base"} onClick={() => state.setSide("base")} />
    </div>
  );
}

/**
 * The right-rail "Search" tab: a query input, a General|Symbol mode toggle,
 * mode-specific options (case/regex for general; Definition|Usages for symbol),
 * a Head|Base checkout toggle, and the shared {@link ResultsList}. Runs on
 * Enter. "View file" opens the file in the shared file navigator (owned by
 * ReviewView).
 *
 * @param props.state - The code-search state from `useCodeSearch`.
 * @param props.onOpenFile - Open a result location in the file navigator.
 */
export function SearchRailPanel(props: { state: CodeSearchState; onOpenFile: (target: FileTarget) => void }): React.JSX.Element {
  const { state, onOpenFile } = props;

  // The header reflects the last run (frozen), not the live controls, so editing
  // the query/mode does not change it until Run is pressed.
  const run: RunSnapshot | null = state.lastRun;
  const header: ResultsHeader = run
    ? { op: opLabel(run), term: run.term, scope: run.side, scopeFile: run.scopeFile }
    : { op: opLabel(state), term: "", scope: state.side };
  const openFile = (loc: OpenLocation): void => onOpenFile({ path: loc.path, sha: loc.sha, line: loc.line });

  return (
    <div className="search-rail-panel">
      <div className="search-rail-controls">
        <input
          type="text"
          className="search-rail-query"
          placeholder={state.mode === "symbol" ? "Symbol name…" : "Search text…"}
          value={state.query}
          onChange={(e) => state.setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") state.runFromRail(); }}
        />
        <div className="search-rail-row">
          <ModeToggle state={state} />
          <SideToggle state={state} />
        </div>
        {state.mode === "general" ? (
          <div className="search-rail-row">
            <label className="results-toggle"><input type="checkbox" checked={state.caseSensitive} onChange={(e) => state.setCaseSensitive(e.target.checked)} /> Case sensitive</label>
            <label className="results-toggle"><input type="checkbox" checked={state.regex} onChange={(e) => state.setRegex(e.target.checked)} /> Regex</label>
          </div>
        ) : (
          <div className="search-rail-row"><ActionToggle state={state} /></div>
        )}
        <div className="search-rail-run">
          <button
            type="button"
            className={state.dirty ? "btn btn-accent btn-sm" : "btn btn-sm"}
            onClick={state.runFromRail}
            disabled={state.query.trim() === "" || !state.dirty}
          >
            Run
          </button>
          {state.dirty && state.results.length > 0 && (
            <span className="search-rail-stale">Inputs changed — press Run to update</span>
          )}
        </div>
      </div>
      <ResultsList
        results={state.results}
        loading={state.loading}
        error={state.error}
        filters={state.filters}
        onFilters={state.setFilters}
        sha={state.resultSha}
        header={header}
        onOpen={openFile}
        onClose={() => { /* rail Esc collapse is owned by RightRail */ }}
        onBroaden={state.broaden}
      />
    </div>
  );
}
