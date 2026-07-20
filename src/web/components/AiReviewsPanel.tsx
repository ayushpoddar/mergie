import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "../trpc.ts";
import { formatCommitTime } from "@/web/lib/time.ts";
import { isStale } from "@/domain/ranges.ts";
import { ChevronRightIcon, SparkleIcon } from "./Icons.tsx";

/** A short single-line preview of a review body. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
}

/**
 * The right-rail "AI reviews" panel: lists every AI review on the PR (across
 * ranges), each with the range it covers and a link to open it with that range
 * selected in a new tab. Stale ranges (whose commits no longer exist after a
 * force-push/rebase) are flagged and cannot be opened.
 */
export function AiReviewsPanel(props: { prId: string }): React.JSX.Element {
  const { prId } = props;
  const reviews = trpc.listAiReviews.useQuery({ id: prId });
  const topo = trpc.commitsWithBaseline.useQuery({ id: prId });
  const all = reviews.data ?? [];
  const commitTopo = { baselineSha: topo.data?.baselineSha ?? "", commits: (topo.data?.commits ?? []).map((c) => c.sha) };
  const stale = (startSha: string, endSha: string): boolean =>
    topo.data !== undefined && isStale({ startSha, endSha }, commitTopo);

  return (
    <ul className="comment-list ai-reviews-list">
      {all.map((r) => {
        const isStaleReview: boolean = stale(r.startSha, r.endSha);
        return (
          <li key={r.id} className="comment-list-item">
            <div className="comment-list-meta">
              <code>{r.startSha.slice(0, 7)} → {r.endSha.slice(0, 7)}</code>
              <span>{r.model}</span>
              {r.template && <span className="badge">{r.template}</span>}
              {isStaleReview && <span className="badge stale">stale</span>}
              <span className="comment-time">{formatCommitTime(new Date(r.createdAt).toISOString())}</span>
              {isStaleReview
                ? <span className="notice" title="A commit in this range no longer exists (force-push/rebase)">range unavailable</span>
                : <a href={`/?pr=${prId}&start=${r.startSha}&end=${r.endSha}`} target="_blank" rel="noreferrer">Open with this range ↗</a>}
            </div>
            {r.prompt && <div className="comment-list-body"><em>Focus: {r.prompt}</em></div>}
            <details className="disclosure">
              <summary><ChevronRightIcon size={14} className="disclosure-chevron" /> {preview(r.body)}</summary>
              <div className="comment-body"><Markdown remarkPlugins={[remarkGfm]}>{r.body}</Markdown></div>
            </details>
          </li>
        );
      })}
      {all.length === 0 && (
        <li>
          <div className="empty-state">
            <SparkleIcon size={40} />
            <p className="empty-state-title">No AI reviews yet</p>
            <p className="empty-state-hint">Run an AI review on the current commit range to see it listed here.</p>
          </div>
        </li>
      )}
    </ul>
  );
}
