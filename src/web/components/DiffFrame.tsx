import { useEffect, useRef, useState } from "react";
import { trpc } from "../trpc.ts";
import { firstChangedIndexFrom } from "@/web/lib/anchorRow.ts";
import { highlightToHtml, languageForPath } from "@/web/lib/highlight.ts";
import { applyDiffMarks } from "@/web/lib/diffMarks.ts";
import { splitSideIsEmpty } from "@/web/lib/splitSide.ts";
import { FileIcon } from "./Icons.tsx";
import type { SplitCell, SplitRow } from "@/daemon/splitView.ts";

/** Render one side's code cell (blank for padding). The `side` (left=base,
 * right=head) is stamped as `data-side` so a symbol selected here defaults its
 * lookup to that checkout. */
function codeCell(cell: SplitCell, language: string | undefined, side: "base" | "head"): React.JSX.Element {
  const html: string = cell.kind === "empty" ? "" : applyDiffMarks(highlightToHtml(cell.text, language), cell.changes ?? []);
  return (
    <>
      <td className="split-no">{cell.no ?? ""}</td>
      <td className={`split-code split-${cell.kind}`} data-side={side} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

/** Row index whose left/right line number equals `anchorLine`, or -1. */
function anchorMatchIndex(rows: SplitRow[], anchorLine: number | null): number {
  if (anchorLine === null) return -1;
  return rows.findIndex((r) => r.right.no === anchorLine || r.left.no === anchorLine);
}

/**
 * The split base/head body of a file over a range: the synced-scroll table
 * (single table so both columns scroll together), the anchor-line nudge onto
 * the first real +/- line, the one-shot open flash, and the single-column
 * placeholder when one side is empty (added/deleted file). Presentational:
 * owns only the `fileSplit` query + the anchor/flash effect. Reused by the
 * full-file modal and the file navigator.
 *
 * @param props.prId - PR id the file belongs to.
 * @param props.path - Repo-relative file path.
 * @param props.start - Base SHA of the range.
 * @param props.end - Head SHA of the range.
 * @param props.anchorLine - 1-based line to center + flash, or null.
 * @param props.hideWhitespace - When true, collapse whitespace-only changes
 *   (keeps the split view consistent with the main diff's toggle).
 */
export function DiffFrame(props: {
  prId: string;
  path: string;
  start: string;
  end: string;
  anchorLine: number | null;
  hideWhitespace?: boolean;
}): React.JSX.Element {
  const { prId, path, start, end, anchorLine, hideWhitespace } = props;
  const language: string | undefined = languageForPath(path);
  const split = trpc.fileSplit.useQuery({ id: prId, path, start, end, ignoreWhitespace: hideWhitespace ?? false });
  const rows: SplitRow[] = split.data ?? [];
  const anchorRef = useRef<HTMLTableRowElement>(null);
  // Nudge the anchor off the context line it was opened at (e.g. a `}`) onto the
  // first real +/- line at or below it.
  const anchorIdx: number = firstChangedIndexFrom(rows, anchorMatchIndex(rows, anchorLine));
  const baseEmpty: boolean = splitSideIsEmpty(rows, "left");
  const headEmpty: boolean = splitSideIsEmpty(rows, "right");
  // A one-shot flash: highlight the anchor on open, then fade out (see the
  // `.split-anchor` animation). Reset to false first so the animation re-runs
  // whenever the anchor changes (reopening View file / a different hunk).
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (anchorRef.current) anchorRef.current.scrollIntoView({ block: "center" });
    if (anchorIdx < 0) return;
    setFlashing(false);
    const id = requestAnimationFrame(() => setFlashing(true));
    return () => cancelAnimationFrame(id);
  }, [rows.length, anchorIdx]);

  const anchorClass = (i: number): string | undefined => (i === anchorIdx && flashing ? "split-anchor" : undefined);

  return (
    <div className="full-file-body">
      {split.isLoading && <p className="notice">Loading file…</p>}
      {baseEmpty && !split.isLoading && (
        <FileBody rows={rows} side="right" language={language} anchorIdx={anchorIdx} anchorRef={anchorRef} anchorClass={anchorClass}
          placeholder="This file was added — there is no base version to compare against." />
      )}
      {headEmpty && !split.isLoading && (
        <FileBody rows={rows} side="left" language={language} anchorIdx={anchorIdx} anchorRef={anchorRef} anchorClass={anchorClass}
          placeholder="This file was deleted — there is no head version to compare against." />
      )}
      {!baseEmpty && !headEmpty && (
        <table className="split-table">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} ref={i === anchorIdx ? anchorRef : undefined} className={anchorClass(i)}>
                {codeCell(r.left, language, "base")}
                {codeCell(r.right, language, "head")}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * A single-column body used when the other side is empty: renders only the
 * side that has content, with a placeholder banner explaining the empty side.
 */
function FileBody(props: {
  rows: SplitRow[];
  side: "left" | "right";
  language: string | undefined;
  anchorIdx: number;
  anchorRef: React.RefObject<HTMLTableRowElement | null>;
  anchorClass: (i: number) => string | undefined;
  placeholder: string;
}): React.JSX.Element {
  const { rows, side, language, anchorIdx, anchorRef, anchorClass, placeholder } = props;
  return (
    <>
      <div className="modal-empty-side"><FileIcon size={28} />{placeholder}</div>
      <table className="split-table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} ref={i === anchorIdx ? anchorRef : undefined} className={anchorClass(i)}>
              {codeCell(r[side], language, side === "left" ? "base" : "head")}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
