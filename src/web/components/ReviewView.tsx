import { useEffect, useState } from "react";
import { trpc } from "../trpc.ts";
import { useReview, type ReviewState, type RangeSel } from "../state/useReview.ts";
import { useCodeSearch, type MenuOp, type SearchSide } from "../state/useCodeSearch.ts";
import { useChat, type ChatState } from "../state/useChat.ts";
import { visibleFiles } from "@/web/lib/visibleFiles.ts";
import { reviewProgress } from "@/web/lib/reviewProgress.ts";
import { usePersistedToggles, hideWhitespaceStorageKey } from "@/web/lib/togglePrefs.ts";
import { usePersistedFlag } from "@/web/lib/persistedFlag.ts";
import { usePageTitle } from "@/web/lib/usePageTitle.ts";
import { Toolbar } from "./Toolbar.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { RangeSelector } from "./RangeSelector.tsx";
import { FileTree, fileSectionId } from "./FileTree.tsx";
import { HunkCard } from "./HunkCard.tsx";
import { FileNavigator } from "./FileNavigator.tsx";
import { IdentifierMenuPortal } from "./IdentifierMenuPortal.tsx";
import { useIdentifierMenu } from "@/web/lib/useIdentifierMenu.ts";
import type { NavFrame } from "@/web/lib/navStack.ts";
import { ChatPanel } from "./ChatPanel.tsx";
import { AiReviewModal } from "./AiReviewModal.tsx";
import { AiReviewIndicator } from "./AiReviewIndicator.tsx";
import { PrStatusBadge } from "./PrStatusBadge.tsx";
import { RightRail } from "./RightRail.tsx";
import { SwitchPrModal } from "./SwitchPrModal.tsx";
import { CopyIconButton } from "./CopyIconButton.tsx";
import type { RailTab } from "@/web/lib/railState.ts";
import {
  RefreshIcon, SparkleIcon, ExternalIcon, FileIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon,
} from "./Icons.tsx";
import type { FileView } from "@/daemon/reviewService.ts";

/** localStorage key for the global left-sidebar collapsed layout preference. */
const LEFT_SIDEBAR_COLLAPSED_KEY = "mergie:leftSidebarCollapsed";

/** localStorage key for the global file-list view (tree vs flat) preference. */
const FILE_TREE_VIEW_KEY = "mergie:fileTreeView";

/** Circumference of the progress ring (radius 14) — used to drive its fill. */
const RING_CIRCUMFERENCE = 2 * Math.PI * 14;

/** Read an initial range from the URL (`?start=&end=`), if both are present. */
function initialRangeFromUrl(): { start: string; end: string } | null {
  const params = new URLSearchParams(window.location.search);
  const start = params.get("start");
  const end = params.get("end");
  return start && end ? { start, end } : null;
}

/** The full review-core screen for one PR. */
export function ReviewView(props: { prId: string }): React.JSX.Element {
  const [hideWhitespace, setHideWhitespace] = usePersistedFlag(hideWhitespaceStorageKey(props.prId), false);
  const review = useReview(props.prId, initialRangeFromUrl(), hideWhitespace);
  const codeSearch = useCodeSearch(props.prId, {
    headSha: () => review.range?.end ?? "",
    baseSha: () => review.range?.start ?? "",
  });
  const chat = useChat(props.prId, () => review.range);
  const [toggles, setToggles] = usePersistedToggles(props.prId);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedFlag(LEFT_SIDEBAR_COLLAPSED_KEY, false);
  const [treeView, setTreeView] = usePersistedFlag(FILE_TREE_VIEW_KEY, true);
  // The frame the file navigator is seeded with; null = navigator closed.
  const [navOrigin, setNavOrigin] = useState<NavFrame | null>(null);
  const diffMenu = useIdentifierMenu();
  // The AI-review popup target: null = closed. Holds the range to review, which
  // is normally the current range but can be a different range when opened from
  // the "review ready" header indicator.
  const [reviewing, setReviewing] = useState<RangeSel | null>(null);
  const [railTab, setRailTab] = useState<RailTab | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Hunks temporarily forced visible (jumped to from the comments panel even
  // though a view toggle would otherwise hide them). Does not touch the range.
  const [revealedHunks, setRevealedHunks] = useState<ReadonlySet<string>>(new Set());
  const revealHunk = (hunkHash: string): void => setRevealedHunks((s) => new Set(s).add(hunkHash));
  // Hunk/file "View file" opens the navigator on a diff frame; the rail's
  // results "View file" opens it on a file frame (see onOpenNavFile below).
  const openFile = (path: string, anchorLine: number | null): void => setNavOrigin({ kind: "diff", path, anchorLine });

  // A reveal is transient: once the user changes the range or their view
  // toggles, normal visibility rules reapply and the revealed hunk hides again.
  const rangeKey: string = `${review.range?.start ?? ""}:${review.range?.end ?? ""}`;
  const toggleKey: string = JSON.stringify(toggles);
  useEffect(() => { setRevealedHunks(new Set()); }, [rangeKey, toggleKey]);

  // Stamp this PR as opened so the picker's "Recently reviewed" list orders by
  // most-recently-viewed. Fires once per PR (not on every range/toggle change).
  const touchPr = trpc.touchPr.useMutation();
  useEffect(() => { touchPr.mutate({ id: props.prId }); }, [props.prId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSymbol = (op: MenuOp, side: SearchSide): void => {
    if (diffMenu.menu) {
      setRailTab("search");
      codeSearch.runFromMenu(op, diffMenu.menu.term, side, diffMenu.menu.file);
    }
    diffMenu.close();
  };
  const health = trpc.health.useQuery();
  const pr = health.data?.prs.find((p) => p.id === props.prId);
  usePageTitle(pr ? `${pr.owner}/${pr.repo} #${pr.number} — ${pr.title}` : null);
  // The diff area and the sidebar share the same toggle-filtered set. The file
  // filter lives inside FileTree (not here) so typing it redraws only the
  // sidebar list, never this component and its diff.
  const files: FileView[] = visibleFiles(review.files, toggles, revealedHunks);
  // Progress counts the whole on-screen range, so view filters don't skew it.
  const progress = reviewProgress(review.files);
  const remaining: number = progress.total - progress.viewed;
  const progressPct: number = progress.total > 0 ? progress.viewed / progress.total : 0;
  const allReviewed: boolean = progress.total > 0 && remaining === 0;

  return (
    <div className="review">
      <header className="review-header">
        <div className="review-header-bar">
          <div className="review-title">
            <div className="review-title-row">
              <strong>{pr ? `${pr.owner}/${pr.repo} #${pr.number}` : props.prId}</strong>
              {pr && <PrStatusBadge state={pr.state} />}
              {pr && (
                <span className="pr-link-group">
                  <a
                    className="review-nav-link"
                    href={`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open on GitHub <ExternalIcon size={12} />
                  </a>
                  <CopyIconButton
                    text={`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`}
                    label="Copy PR URL"
                  />
                </span>
              )}
            </div>
            <span className="pr-subtitle">{pr?.title}</span>
            {pr && (
              <div className="pr-branches">
                <code className="branch-name">{pr.baseRef}</code>
                <CopyIconButton text={pr.baseRef} label="Copy base branch name" size={12} />
                <span className="branch-arrow" aria-label="merges from">←</span>
                <code className="branch-name">{pr.headRef}</code>
                <CopyIconButton text={pr.headRef} label="Copy head branch name" size={12} />
              </div>
            )}
          </div>
          <div className="review-actions">
            <div className="review-action-group">
              <button type="button" className="btn" onClick={() => setPickerOpen(true)} title="Switch to another pull request">
                <ChevronDownIcon size={12} /> Switch PR
              </button>
              <button type="button" className="btn" disabled={review.refreshing} onClick={review.refreshPr} title="Re-fetch the PR for new commits">
                <RefreshIcon size={14} /> {review.refreshing ? "Refreshing…" : "Refresh PR"}
              </button>
              <button type="button" className="btn btn-accent" disabled={!review.range} onClick={() => review.range && setReviewing(review.range)}>
                <SparkleIcon size={14} /> AI review
              </button>
              <AiReviewIndicator prId={props.prId} onOpen={(r) => setReviewing(r)} />
            </div>
            <span className="review-action-divider" />
            <RangeSelector
              baselineSha={review.baselineSha}
              commits={review.commits}
              range={review.range}
              onChange={review.setRange}
              onMarkReviewed={review.markReviewed}
              onUnmarkReviewed={review.unmarkReviewed}
              reviewedRanges={review.reviewedRanges}
            />
          </div>
        </div>
      </header>
      <div className="review-body">
        <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
          {/* Always-present top row: the "View" heading (hidden when collapsed)
              shares one line with the collapse/expand chevron, so there is no
              empty band above the switches and the toggle stays visible in both
              states. */}
          <div className="sidebar-header">
            {progress.total > 0 ? (
              <div
                className="review-ring-group"
                role="img"
                aria-label={allReviewed
                  ? "All hunks reviewed"
                  : `${remaining} of ${progress.total} hunks left to review`}
              >
                <div className={allReviewed ? "review-ring done" : "review-ring"}>
                  <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
                    <circle className="review-ring-track" cx="17" cy="17" r="14" strokeWidth="3.5" />
                    <circle
                      className="review-ring-fill"
                      cx="17" cy="17" r="14" strokeWidth="3.5"
                      style={{ strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE * (1 - progressPct) }}
                    />
                  </svg>
                  <span className="review-ring-num">{allReviewed ? "✓" : remaining}</span>
                </div>
                <span className="review-ring-caption">
                  {allReviewed ? "All reviewed" : `${remaining === 1 ? "hunk" : "hunks"} left`}
                </span>
              </div>
            ) : (
              <h2 className="sidebar-heading">View</h2>
            )}
            <Tooltip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} placement="bottom">
              <button
                type="button"
                className="sidebar-toggle"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                {sidebarCollapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
              </button>
            </Tooltip>
          </div>
          {/* Kept mounted while collapsed (hidden via CSS) so the filter text and
              switch states are never lost across a collapse/expand. */}
          <div className="sidebar-content">
            <Toolbar toggles={toggles} onChange={setToggles} hideWhitespace={hideWhitespace} onHideWhitespaceChange={setHideWhitespace} />
            <FileTree
              files={files}
              treeView={treeView}
              onTreeViewChange={setTreeView}
            />
          </div>
        </aside>
        <main className="diff-area" onMouseUp={diffMenu.onMouseUp}>
          {review.loading && (
            <div className="diff-loading"><span className="chat-spinner" aria-hidden="true" /> Loading diff…</div>
          )}
          {!review.loading && files.length === 0 && (
            <div className="empty-state">
              <FileIcon size={36} />
              <p className="empty-state-title">No files to show</p>
              <p className="empty-state-hint">Nothing matches the current range and view filters.</p>
            </div>
          )}
          {files.map((f) => (
            <section key={f.newPath} id={fileSectionId(f.newPath)} className="file-section">
              <h2 className="file-heading">
                <span className="file-heading-name">{f.newPath}</span>
                <CopyIconButton text={f.newPath} label="Copy file path" size={12} />
                <small>{f.status}{f.isLockfile ? " · lock" : ""}</small>
                <span className="file-heading-actions">
                  {!f.isBinary && f.hunks.length > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openFile(f.newPath, null)}>View file</button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => chat.open({ kind: "file", ref: f.newPath, label: f.newPath })}>
                    <SparkleIcon size={12} /> Ask AI
                  </button>
                </span>
              </h2>
              {renderFileBody(f, review, openFile, chat, revealedHunks)}
            </section>
          ))}
        </main>
        <ChatPanel chat={chat} />
        <RightRail
          prId={props.prId}
          active={railTab}
          onActiveChange={setRailTab}
          rangeFiles={review.files}
          renderedFiles={files}
          baselineSha={review.baselineSha ?? ""}
          onReveal={revealHunk}
          prBody={pr?.body ?? ""}
          codeSearch={codeSearch}
          onOpenFile={(f) => setNavOrigin({ kind: "file", path: f.path, sha: f.sha, line: f.line })}
        />
      </div>
      <IdentifierMenuPortal menu={diffMenu.menu} onPick={pickSymbol} onClose={diffMenu.close} />
      {pickerOpen && (
        <SwitchPrModal currentPrId={props.prId} onClose={() => setPickerOpen(false)} />
      )}
      {reviewing && (
        <AiReviewModal prId={props.prId} range={reviewing} onClose={() => setReviewing(null)} />
      )}
      {navOrigin && review.range && (
        <FileNavigator
          prId={props.prId}
          origin={navOrigin}
          range={review.range}
          hideWhitespace={hideWhitespace}
          onClose={() => setNavOrigin(null)}
        />
      )}
    </div>
  );
}

/** Render a file's hunks, or a placeholder for binary / no-change files. */
function renderFileBody(
  file: FileView,
  review: ReviewState,
  openFile: (path: string, anchorLine: number | null) => void,
  chat: ChatState,
  revealedHunks: ReadonlySet<string>,
): React.JSX.Element {
  if (file.isBinary) return <p className="notice">Binary file — not shown.</p>;
  if (file.hunks.length === 0) return <p className="notice">No textual changes.</p>;
  const endSha: string = review.range?.end ?? "";
  return (
    <>
      {file.hunks.map((h) => (
        <HunkCard
          key={h.hash}
          path={file.newPath}
          hunk={h}
          endSha={endSha}
          revealed={revealedHunks.has(h.hash)}
          onToggleViewed={(v) => review.toggleHunkViewed(h.hash, v)}
          addComment={review.addComment}
          editComment={review.editComment}
          deleteComment={review.deleteComment}
          onViewFile={(line) => openFile(file.newPath, line)}
          previewPost={review.previewPost}
          postComment={review.postComment}
          replyToThread={review.replyToThread}
          onAskAi={() => chat.open({ kind: "hunk", ref: h.hash, label: `hunk · ${file.newPath}` })}
        />
      ))}
    </>
  );
}
