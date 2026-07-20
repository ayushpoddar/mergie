import { Fragment, useEffect, useState } from "react";
import { highlightToHtml, languageForPath } from "@/web/lib/highlight.ts";
import { applyDiffMarks } from "@/web/lib/diffMarks.ts";
import { buildLinesAnchor } from "@/web/lib/lineSelection.ts";
import { sideForLineKind } from "@/web/lib/identifierMenu.ts";
import { CommentComposer } from "./CommentComposer.tsx";
import { CommentItem } from "./CommentItem.tsx";
import { GithubThreadView } from "./GithubThreadView.tsx";
import type { DiffLine } from "@/domain/diff.ts";
import type { AnchoredComment, AnchoredGithubThread } from "@/daemon/reviewService.ts";
import type { PostPreview, PostTarget } from "@/daemon/registry.ts";
import type { AddCommentArgs } from "../state/useReview.ts";

/** Marker character for a diff line kind. */
function marker(kind: DiffLine["kind"]): string {
  return kind === "add" ? "+" : kind === "del" ? "-" : " ";
}

/** Group a hunk's line-level comments by their line index. */
function commentsByLine(comments: AnchoredComment[]): Map<number, AnchoredComment[]> {
  const map = new Map<number, AnchoredComment[]>();
  for (const c of comments) {
    if (c.lineIndex < 0) continue;
    map.set(c.lineIndex, [...(map.get(c.lineIndex) ?? []), c]);
  }
  return map;
}

/** Group synced GitHub threads by their anchored line index. */
function threadsByLine(threads: AnchoredGithubThread[]): Map<number, AnchoredGithubThread[]> {
  const map = new Map<number, AnchoredGithubThread[]>();
  for (const t of threads) {
    if (t.lineIndex < 0) continue;
    map.set(t.lineIndex, [...(map.get(t.lineIndex) ?? []), t]);
  }
  return map;
}

/** An inclusive range of line indices. */
interface Span {
  start: number;
  end: number;
}

/** Normalise a span to [lo, hi]. */
function bounds(span: Span | null): { lo: number; hi: number } {
  if (!span) return { lo: -1, hi: -1 };
  return { lo: Math.min(span.start, span.end), hi: Math.max(span.start, span.end) };
}

/**
 * Render a hunk's lines with gutters, markers, highlighting, and inline
 * comments. Press the `+` on a line and drag over lines (GitHub-style) to
 * select a range, then release to open a comment composer for that range.
 */
export function DiffLines(props: {
  lines: DiffLine[];
  path: string;
  comments: AnchoredComment[];
  githubThreads: AnchoredGithubThread[];
  endSha: string;
  onAddComment: (args: AddCommentArgs) => void;
  onEditComment: (id: number, body: string) => void;
  onDeleteComment: (id: number) => void;
  onReplyToThread: (rootGithubId: string, body: string) => void;
  previewPost: (commentId: number, target: PostTarget) => Promise<PostPreview>;
  onPostComment: (commentId: number, target: PostTarget) => void;
}): React.JSX.Element {
  const { lines, path, comments, githubThreads, endSha, onAddComment, onEditComment, onDeleteComment } = props;
  const { onReplyToThread, previewPost, onPostComment } = props;
  const language: string | undefined = languageForPath(path);
  const byLine = commentsByLine(comments);
  const threadLines = threadsByLine(githubThreads);
  const [dragging, setDragging] = useState<Span | null>(null);
  const [composing, setComposing] = useState<Span | null>(null);

  // Finish the drag on mouse release anywhere in the window.
  useEffect(() => {
    if (!dragging) return;
    const onUp = (): void => { setComposing(dragging); setDragging(null); };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragging]);

  const submit = (body: string): void => {
    if (composing) {
      const anchor = buildLinesAnchor(lines, composing.start, composing.end);
      if (anchor) onAddComment({ kind: "lines", path, body, madeAtSha: endSha, ...anchor });
    }
    setComposing(null);
  };

  const active = bounds(dragging ?? composing);

  return (
    <table className={dragging ? "diff-lines dragging" : "diff-lines"}>
      <tbody>
        {lines.map((line, i) => (
          <Fragment key={i}>
            <tr
              className={`line line-${line.kind}${i >= active.lo && i <= active.hi ? " selected" : ""}`}
              onMouseEnter={() => setDragging((d) => (d ? { start: d.start, end: i } : d))}
            >
              <td className="line-act">
                <button
                  type="button"
                  className="add-comment"
                  title="Comment — drag over lines to select a range"
                  onMouseDown={(e) => { e.preventDefault(); setComposing(null); setDragging({ start: i, end: i }); }}
                >+</button>
              </td>
              <td className="gutter old">{line.oldNo ?? ""}</td>
              <td className="gutter new">{line.newNo ?? ""}</td>
              <td className="marker">{marker(line.kind)}</td>
              <td className="code" data-side={sideForLineKind(line.kind)} dangerouslySetInnerHTML={{ __html: applyDiffMarks(highlightToHtml(line.text, language), line.changes ?? []) }} />
            </tr>
            {(byLine.get(i) ?? []).map((c) => (
              <tr key={`c${c.id}`} className="comment-row">
                <td colSpan={5}>
                  <CommentItem
                    comment={c}
                    onEdit={(body) => onEditComment(c.id, body)}
                    onDelete={() => onDeleteComment(c.id)}
                    previewPost={(target) => previewPost(c.id, target)}
                    onPost={(target) => onPostComment(c.id, target)}
                  />
                </td>
              </tr>
            ))}
            {(threadLines.get(i) ?? []).map((t) => (
              <tr key={`t${t.root.githubId}`} className="comment-row">
                <td colSpan={5}>
                  <GithubThreadView thread={t} onReply={(body) => onReplyToThread(t.root.githubId, body)} />
                </td>
              </tr>
            ))}
            {composing && bounds(composing).hi === i && (
              <tr className="comment-row">
                <td colSpan={5}>
                  <CommentComposer onSubmit={submit} onCancel={() => setComposing(null)} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
