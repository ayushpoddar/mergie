import { useEffect } from "react";
import { trpc } from "../trpc.ts";
import { nextRailTab, type RailTab } from "@/web/lib/railState.ts";
import { CommentsPanel } from "./CommentsPanel.tsx";
import { AiReviewsPanel } from "./AiReviewsPanel.tsx";
import { PrDescription } from "./PrDescription.tsx";
import { SearchRailPanel } from "./SearchRailPanel.tsx";
import type { FileTarget } from "./FileView.tsx";
import { Tooltip } from "./Tooltip.tsx";
import {
  CommentIcon, SparkleIcon, DocumentIcon, SearchIcon, CloseIcon,
} from "./Icons.tsx";
import type { FileView } from "@/daemon/reviewService.ts";
import type { CodeSearchState } from "../state/useCodeSearch.ts";

/** Static presentation for each rail tab: icon, label, tooltip. */
interface RailTabMeta {
  /** The rail tab this metadata describes. */
  tab: RailTab;
  /** Human-readable panel title + tooltip / aria-label. */
  label: string;
  /** The inline-SVG icon component for the rail button. */
  Icon: (props: { size?: number }) => React.JSX.Element;
}

/** Order + presentation of the rail tabs (top → bottom). */
const TAB_META: readonly RailTabMeta[] = [
  { tab: "comments", label: "Comments", Icon: CommentIcon },
  { tab: "reviews", label: "AI reviews", Icon: SparkleIcon },
  { tab: "description", label: "PR description", Icon: DocumentIcon },
  { tab: "search", label: "Search", Icon: SearchIcon },
] as const;

/**
 * The right icon rail plus its expandable sidebar. The rail (three icon
 * buttons) is always visible, pinned to the right edge. Clicking an icon
 * expands the sidebar to its left showing that surface and pushes the diff
 * aside; clicking the active icon again — or pressing Esc — collapses it.
 *
 * All three surfaces stay MOUNTED whenever the sidebar is open; the inactive
 * ones are hidden via `hidden`, so each keeps its own scroll position and
 * internal state across tab switches within a session.
 */
export function RightRail(props: {
  /** PR id. */
  prId: string;
  /** The active rail tab, or null when the sidebar is collapsed. */
  active: RailTab | null;
  /** Set the active tab (null collapses). */
  onActiveChange: (tab: RailTab | null) => void;
  /** All files/hunks in the selected range (before view toggles). */
  rangeFiles: FileView[];
  /** The subset currently rendered on screen (after view toggles). */
  renderedFiles: FileView[];
  /** Baseline SHA for the comments panel's "view in context" link. */
  baselineSha: string;
  /** Force a hunk visible so a jumped-to comment can be scrolled into view. */
  onReveal: (hunkHash: string) => void;
  /** The PR body markdown for the description panel. */
  prBody: string;
  /** The code-search state hosting the Search tab. */
  codeSearch: CodeSearchState;
  /** Open a result location in the file navigator (owned by ReviewView). */
  onOpenFile: (target: FileTarget) => void;
}): React.JSX.Element {
  const { prId, active, onActiveChange, rangeFiles, renderedFiles, baselineSha, onReveal, prBody, codeSearch, onOpenFile } = props;

  // Live total comment count for the Comments icon badge. Shares react-query's
  // cache with the panel's own listAllComments query, so the two always agree.
  const commentCount: number = trpc.listAllComments.useQuery({ id: prId }).data?.length ?? 0;

  // Esc collapses the sidebar when a tab is open. The comments panel dismisses
  // its own out-of-range prompt first (capture-phase handler stops propagation).
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onActiveChange(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onActiveChange]);

  const activeLabel: string = TAB_META.find((m) => m.tab === active)?.label ?? "";

  return (
    <>
      {/* The sidebar stays MOUNTED across collapse (hidden, not unmounted) so
          every panel's scroll position and internal state survive a
          collapse→reopen within the session. */}
      <aside className="rail-sidebar" aria-label={activeLabel} hidden={active === null}>
        <header className="rail-sidebar-header">
          <strong>{activeLabel}</strong>
          <button
            type="button"
            className="symbol-panel-close"
            onClick={() => onActiveChange(null)}
            title="Close (Esc)"
            aria-label="Close"
          >
            <CloseIcon size={16} />
          </button>
        </header>
        <div className="rail-sidebar-body">
          <div className="rail-panel" hidden={active !== "comments"}>
            <CommentsPanel
              prId={prId}
              rangeFiles={rangeFiles}
              renderedFiles={renderedFiles}
              baselineSha={baselineSha}
              onReveal={onReveal}
            />
          </div>
          <div className="rail-panel" hidden={active !== "reviews"}>
            <AiReviewsPanel prId={prId} />
          </div>
          <div className="rail-panel" hidden={active !== "description"}>
            <PrDescription body={prBody} />
          </div>
          <div className="rail-panel" hidden={active !== "search"}>
            <SearchRailPanel state={codeSearch} onOpenFile={onOpenFile} />
          </div>
        </div>
      </aside>
      <nav className="right-rail" aria-label="Review panels">
        {TAB_META.map(({ tab, label, Icon }) => (
          <div key={tab} className="rail-item">
            <Tooltip label={label} placement="left">
              <button
                type="button"
                className={active === tab ? "rail-btn active" : "rail-btn"}
                aria-pressed={active === tab}
                aria-label={label}
                onClick={() => onActiveChange(nextRailTab(active, tab))}
              >
                <Icon size={20} />
                {tab === "comments" && commentCount > 0 && (
                  <span className="rail-badge" aria-hidden="true">{commentCount}</span>
                )}
              </button>
            </Tooltip>
          </div>
        ))}
      </nav>
    </>
  );
}
