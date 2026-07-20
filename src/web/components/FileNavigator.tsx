import { useEffect, useReducer, useState } from "react";
import { DiffFrame } from "./DiffFrame.tsx";
import { FileFrame } from "./FileFrame.tsx";
import { ResultsList, type OpenLocation, type ResultsHeader } from "./ResultsList.tsx";
import { IdentifierMenuPortal } from "./IdentifierMenuPortal.tsx";
import { useIdentifierMenu } from "@/web/lib/useIdentifierMenu.ts";
import { useNavLookup } from "@/web/lib/useNavLookup.ts";
import { opLabel } from "@/web/lib/navRouting.ts";
import {
  navStackReducer, initNavStack, currentFrame, canGoBack, canGoForward, frameKey,
  type NavFrame, type NavStack, type NavStackAction,
} from "@/web/lib/navStack.ts";
import { CloseIcon, FileIcon, ChevronLeftIcon, ChevronRightIcon } from "./Icons.tsx";
import type { CodeResultFilters } from "@/web/lib/filterCodeResults.ts";
import type { MenuOp, SearchSide } from "../state/useCodeSearch.ts";

/** Breadcrumb-style title for the frame currently on screen. */
function frameTitle(frame: NavFrame): React.JSX.Element {
  if (frame.kind === "diff") return <><FileIcon size={14} />{frame.path} <span className="split-base-head">diff</span></>;
  if (frame.kind === "file") return <><FileIcon size={14} />{frame.path}:{frame.line} <span className="split-base-head">@ <code>{frame.sha.slice(0, 7)}</code></span></>;
  return <><strong>{opLabel(frame.op)}</strong> <code>{frame.term}</code> <span className="symbol-side-tag">{frame.side}</span></>;
}

/** Resolve the SHA to run a lookup against for a given side + range. */
function shaForSide(side: SearchSide, range: { start: string; end: string }): string {
  return side === "base" ? range.start : range.end;
}

/**
 * A stackable file/results overlay with Back/Forward history. Hosts a frame
 * stack (a starting diff or file frame, plus frames pushed by double-clicking a
 * symbol inside a diff/file frame or by opening a hit from a results frame).
 * Every visited frame stays mounted (hidden when not current) so returning to a
 * file restores the scroll position rather than re-centering.
 *
 * Double-click routing: Usages/Search and multi-result Definition push a
 * results frame; an *unscoped* single-result Definition and a results-hit "View
 * file" push a file frame (a *scoped* single-result Definition stays a results
 * frame so its scope chip + broaden control remain reachable). The navigator is
 * the topmost overlay: it owns Esc (closes the whole navigator) and — via the
 * results list — ↑/↓/Enter, without collapsing the rail behind it. An open
 * symbol menu takes Esc precedence over it.
 *
 * @param props.prId - PR id everything runs against.
 * @param props.origin - The frame to seed the history with.
 * @param props.range - The current review range (base/head SHAs for diffs + lookups).
 * @param props.hideWhitespace - When true, collapse whitespace-only changes in
 *   the split diff (mirrors the main diff's toggle).
 * @param props.onClose - Close the whole navigator.
 */
export function FileNavigator(props: {
  prId: string;
  origin: NavFrame;
  range: { start: string; end: string };
  hideWhitespace?: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { prId, origin, range, hideWhitespace, onClose } = props;
  const [state, dispatch] = useReducer(navStackReducer, origin, initNavStack);
  const push = (frame: NavFrame): void => dispatch({ type: "push", frame });
  const menu = useIdentifierMenu();
  const lookup = useNavLookup(prId, push);
  const [filters, setFilters] = useState<CodeResultFilters>({});

  useOverlayEsc(menu.menu !== null, menu.close, onClose);

  const frame: NavFrame = currentFrame(state);
  const pick = (op: MenuOp, side: SearchSide): void => {
    // Scope the lookup to the file being viewed. The diff/file frame's own path
    // is the reliable scope hint here (navigator frames have no `.file-section`
    // for the selection-based hint to read), so prefer it.
    if (menu.menu) {
      const file: string = frame.kind === "results" ? menu.menu.file : frame.path;
      lookup.run({ op, term: menu.menu.term, side, file, sha: shaForSide(side, range) });
    }
    menu.close();
  };
  const openHit = (loc: OpenLocation): void => push({ kind: "file", path: loc.path, sha: loc.sha, line: loc.line });
  // Re-run a scoped results frame's lookup repo-wide (the "search everywhere" chip action).
  const broaden = (f: NavFrame): void => {
    if (f.kind !== "results" || f.scopeFile === "") return;
    lookup.run({ op: f.op, term: f.term, side: f.side, file: "", sha: f.sha });
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal full-file file-navigator" onClick={(e) => e.stopPropagation()}>
          <NavControls state={state} dispatch={dispatch} onClose={onClose} title={frameTitle(frame)} />
          {lookup.loading && (
            <div className="diff-loading"><span className="chat-spinner" aria-hidden="true" /> Looking up…</div>
          )}
          {lookup.error && <p className="notice results-error">{lookup.error}</p>}
          {/* All visited frames stay mounted; only the current one is visible.
              Keys combine the history index with the frame identity so going
              Back/Forward reuses the same mounted instance (preserving scroll),
              while pushing a new frame after going Back replaces the slot. */}
          {state.stack.map((f, i) => (
            <NavFrameBody
              key={`${i}:${frameKey(f)}`}
              visible={i === state.index}
              prId={prId} frame={f} range={range} menu={menu}
              filters={filters} onFilters={setFilters} onOpenHit={openHit}
              onClose={onClose} onBroaden={() => broaden(f)}
              hideWhitespace={hideWhitespace}
            />
          ))}
        </div>
      </div>
      {/* The menu portals to document.body but React re-dispatches its events
          through this parent; keeping it a SIBLING of the overlay (not a child)
          stops a menu click from bubbling into the overlay's close-on-click. */}
      <IdentifierMenuPortal menu={menu.menu} onPick={pick} onClose={menu.close} />
    </>
  );
}

/** Back/Forward + breadcrumb title + close, along the navigator's top edge. */
function NavControls(props: {
  state: NavStack;
  dispatch: (a: NavStackAction) => void;
  title: React.ReactNode;
  onClose: () => void;
}): React.JSX.Element {
  const { state, dispatch, title, onClose } = props;
  return (
    <header className="modal-header nav-header">
      <span className="nav-nav">
        <button type="button" className="btn btn-ghost btn-sm" disabled={!canGoBack(state)} onClick={() => dispatch({ type: "back" })} aria-label="Back"><ChevronLeftIcon size={16} /></button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!canGoForward(state)} onClick={() => dispatch({ type: "forward" })} aria-label="Forward"><ChevronRightIcon size={16} /></button>
      </span>
      <span className="modal-title nav-title">{title}</span>
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
    </header>
  );
}

/**
 * Render the body for one frame, attaching the identifier menu to code frames.
 * Hidden (rather than unmounted) when not the current frame so its query result
 * and scroll position survive Back/Forward.
 */
function NavFrameBody(props: {
  prId: string;
  frame: NavFrame;
  range: { start: string; end: string };
  menu: ReturnType<typeof useIdentifierMenu>;
  filters: CodeResultFilters;
  onFilters: (f: CodeResultFilters) => void;
  onOpenHit: (loc: OpenLocation) => void;
  onClose: () => void;
  onBroaden: () => void;
  visible: boolean;
  hideWhitespace?: boolean;
}): React.JSX.Element {
  const { prId, frame, range, menu, filters, onFilters, onOpenHit, onClose, onBroaden, visible, hideWhitespace } = props;
  const hidden: string = visible ? "" : " hidden";
  if (frame.kind === "results") {
    const header: ResultsHeader = { op: opLabel(frame.op), term: frame.term, scope: frame.side, scopeFile: frame.scopeFile };
    return (
      <div className={`nav-slot${hidden}`}>
        <ResultsList
          results={frame.results} loading={false} error={null}
          filters={filters} onFilters={onFilters} sha={frame.sha}
          header={header} onOpen={onOpenHit} onClose={onClose} onBroaden={onBroaden}
        />
      </div>
    );
  }
  return (
    <div className={`nav-code${hidden}`} onMouseUp={menu.onMouseUp} onDoubleClick={menu.onDoubleClick}>
      {frame.kind === "diff"
        ? <DiffFrame prId={prId} path={frame.path} start={range.start} end={range.end} anchorLine={frame.anchorLine ?? null} hideWhitespace={hideWhitespace} />
        : <FileFrame prId={prId} path={frame.path} sha={frame.sha} line={frame.line} side={frame.sha === range.start ? "base" : "head"} />}
    </div>
  );
}

/**
 * Single topmost-overlay keyboard owner. On Escape: if the symbol menu is open,
 * close it; otherwise close the navigator. Either way the event is stopped
 * (capture-phase) so the rail behind never collapses on the same keypress.
 */
function useOverlayEsc(menuOpen: boolean, closeMenu: () => void, closeNav: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (menuOpen) closeMenu();
      else closeNav();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [menuOpen, closeMenu, closeNav]);
}
