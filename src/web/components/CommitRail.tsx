import { useState } from "react";
import { formatCommitTime } from "@/web/lib/time.ts";
import type { CommitInfo } from "@/services/git.ts";

/** Truncate a commit subject for display. */
function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Class name for a commit row given its position in the selected range. */
function rowClass(i: number, fromIndex: number, toIndex: number): string {
  const parts: string[] = ["rail-row"];
  if (i >= fromIndex && i <= toIndex) parts.push("in-range");
  if (i === fromIndex) parts.push("range-start");
  if (i === toIndex) parts.push("range-end");
  return parts.join(" ");
}

/**
 * A vertical list of the PR's commits (oldest → newest) with timestamps. The
 * currently-selected inclusive range is shown as a highlighted band. Click a
 * commit to start a selection, then click another to complete the range.
 */
export function CommitRail(props: {
  commits: CommitInfo[];
  fromIndex: number;
  toIndex: number;
  onSelect: (fromIndex: number, toIndex: number) => void;
}): React.JSX.Element {
  const { commits, fromIndex, toIndex, onSelect } = props;
  const [anchor, setAnchor] = useState<number | null>(null);

  function clickRow(i: number): void {
    if (anchor === null) {
      setAnchor(i);
      onSelect(i, i);
    } else {
      onSelect(Math.min(anchor, i), Math.max(anchor, i));
      setAnchor(null);
    }
  }

  return (
    <div className="commit-rail">
      <p className="rail-hint">
        {anchor === null
          ? "Click a commit to start, then click another to set the range."
          : "Now click the other end of the range."}
      </p>
      <div className="rail-base">◦ base — before the PR</div>
      <ol className="rail-list">
        {commits.map((c, i) => (
          <li key={c.sha}>
            <button type="button" className={rowClass(i, fromIndex, toIndex)} onClick={() => clickRow(i)}>
              <code className="rail-sha">{c.shortSha}</code>
              <span className="rail-subject">{truncate(c.subject)}</span>
              <span className="rail-time">{formatCommitTime(c.isoDate)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
