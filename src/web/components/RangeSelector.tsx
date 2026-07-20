import { useCallback, useEffect, useRef, useState } from "react";
import { toInclusive, toRange } from "@/web/lib/rangeMap.ts";
import { rangeCoverageLabel } from "@/web/lib/rangeCoverage.ts";
import { formatCommitTime } from "@/web/lib/time.ts";
import { useEscToClose } from "@/web/lib/useEscToClose.ts";
import { isRangeReviewed, isStale } from "@/domain/ranges.ts";
import { CommitRail } from "./CommitRail.tsx";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "./Icons.tsx";
import type { CommitInfo } from "@/services/git.ts";
import type { ReviewedRangeRow } from "@/db/repositories/reviewedRanges.ts";
import type { RangeSel } from "../state/useReview.ts";

/**
 * Commit-range selector. A compact summary chip shows the current range as a
 * coverage label ("All N commits" / "K of N commits") plus the newest commit's
 * subject; hovering the chip reveals the SHA range. Clicking it opens a panel
 * with a visual commit rail for changing the selection (applied live). The
 * panel closes on outside-click or Esc, keeping the current selection.
 * Presented inclusively (first..last commit included) and mapped internally to
 * the exclusive baseline→end range.
 */
export function RangeSelector(props: {
  baselineSha: string | null;
  commits: CommitInfo[];
  range: RangeSel | null;
  onChange: (r: RangeSel) => void;
  onMarkReviewed: () => void;
  onUnmarkReviewed: () => void;
  reviewedRanges: ReviewedRangeRow[];
}): React.JSX.Element {
  const { baselineSha, commits, range, onChange, onMarkReviewed, onUnmarkReviewed, reviewedRanges } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onEsc = useCallback(() => setOpen((o) => (o ? false : o)), []);
  useEscToClose(onEsc);

  // Close when clicking anywhere outside this selector (chip + panel). Bound
  // only while open; a pointerdown listener fires before the click, so a
  // selection inside the panel is never swallowed.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target: Node | null = e.target instanceof Node ? e.target : null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!range || baselineSha === null || commits.length === 0) {
    return <div className="range-selector">Loading range…</div>;
  }

  const shas: string[] = commits.map((c) => c.sha);
  const sel = toInclusive(range, shas, baselineSha);
  const fromC = commits[sel.fromIndex];
  const toC = commits[sel.toIndex];
  if (!fromC || !toC) return <div className="range-selector">Loading range…</div>;

  const count: number = sel.toIndex - sel.fromIndex + 1;
  const coverage: string = rangeCoverageLabel({ fromIndex: sel.fromIndex, toIndex: sel.toIndex, total: commits.length });
  const shaRange = `${fromC.shortSha} → ${toC.shortSha}`;
  const alreadyReviewed: boolean = isRangeReviewed(
    { startSha: range.start, endSha: range.end },
    reviewedRanges.map((r) => ({ startSha: r.startSha, endSha: r.endSha, createdAt: r.createdAt })),
  );
  const select = (fromIndex: number, toIndex: number): void =>
    onChange(toRange({ fromIndex, toIndex }, shas, baselineSha));

  return (
    <div className="range-selector" ref={rootRef}>
      <button
        type="button"
        className="range-chip"
        title={`${shaRange}\n${toC.subject}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="range-chip-coverage">{coverage}</span>
        <span className="range-chip-sep">·</span>
        <span className="range-chip-subject">{toC.subject}</span>
        <span className="chip-caret">{open ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}</span>
      </button>

      {open && (
        <div className="range-panel">
          <CommitRail commits={commits} fromIndex={sel.fromIndex} toIndex={sel.toIndex} onSelect={select} />
          <p className="range-caption">
            {count === 1 ? (
              <>
                This commit: <span className="range-caption-subject">“{toC.subject}”</span>{" "}
                ({toC.authorName}, {formatCommitTime(toC.isoDate)}) <code>{toC.shortSha}</code>.
              </>
            ) : (
              <>
                From <span className="range-caption-subject">“{fromC.subject}”</span> ({fromC.authorName},{" "}
                {formatCommitTime(fromC.isoDate)}) <code>{fromC.shortSha}</code>{" "}
                to <span className="range-caption-subject">“{toC.subject}”</span>{" "}
                ({formatCommitTime(toC.isoDate)}) <code>{toC.shortSha}</code>.
              </>
            )}
            {sel.fromIndex === 0
              ? " Diff is from the start of the PR."
              : ` Diff shows changes made after ${commits[sel.fromIndex - 1]?.shortSha ?? "the baseline"}.`}
          </p>
          <div className="range-panel-actions">
            {alreadyReviewed ? (
              <button type="button" className="range-reviewed-badge" title="Reviewed — click to un-mark this range" onClick={onUnmarkReviewed}>
                <CheckIcon size={14} /> Range reviewed
              </button>
            ) : (
              <button type="button" className="btn btn-sm" onClick={onMarkReviewed}>Mark range reviewed</button>
            )}
            <span className="reviewed-count">{reviewedRanges.length} reviewed</span>
          </div>
          {reviewedRanges.length > 0 && (
            <ul className="reviewed-list">
              {reviewedRanges.map((r) => {
                const stale: boolean = isStale({ startSha: r.startSha, endSha: r.endSha }, { baselineSha, commits: shas });
                return (
                  <li key={`${r.startSha}-${r.endSha}`}>
                    <button
                      type="button"
                      className="reviewed-range"
                      disabled={stale}
                      title={stale ? "A commit in this range no longer exists (force-push/rebase)" : "Select this reviewed range"}
                      onClick={() => onChange({ start: r.startSha, end: r.endSha })}
                    >
                      <code>{r.startSha.slice(0, 7)}</code> → <code>{r.endSha.slice(0, 7)}</code>
                    </button>
                    {stale && <span className="badge stale">stale</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
