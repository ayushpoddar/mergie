import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "../trpc.ts";
import { formatCommitTime } from "@/web/lib/time.ts";
import { useEscToClose } from "@/web/lib/useEscToClose.ts";
import { ChevronRightIcon, CloseIcon, SparkleIcon } from "./Icons.tsx";
import type { RangeSel } from "../state/useReview.ts";

/**
 * The AI-review dialog for the current commit range: an optional focus prompt,
 * a template + model picker, the run action, the streamed result, and the past
 * reviews recorded for this same range.
 */
export function AiReviewModal(props: { prId: string; range: RangeSel; onClose: () => void }): React.JSX.Element {
  const { prId, range, onClose } = props;
  useEscToClose(onClose);
  const utils = trpc.useUtils();
  const config = trpc.config.useQuery({ id: prId });
  const reviews = trpc.listAiReviews.useQuery({ id: prId, start: range.start, end: range.end });
  const statuses = trpc.aiReviewStatuses.useQuery({ id: prId }, { refetchInterval: 2000 });
  const invalidate = (): void => {
    void utils.listAiReviews.invalidate();
    void utils.aiReviewStatuses.invalidate();
  };
  // Fire-and-forget: the review runs in the daemon and is tracked app-wide, so
  // the popup can be closed while it runs. We don't hold onto run.data.
  const run = trpc.runAiReview.useMutation({ onSettled: invalidate });

  const [prompt, setPrompt] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [model, setModel] = useState("");
  const models = config.data?.models ?? [];
  const templates = config.data?.templates ?? [];
  const activeModel: string = model || models[0]?.id || "";

  // Whether a review for this exact range is currently running (started here or
  // elsewhere) — so reopening the popup mid-run shows the running state.
  const running: boolean = (statuses.data ?? []).some(
    (s) => s.startSha === range.start && s.endSha === range.end && s.state === "running",
  );

  const start = (): void => {
    if (!activeModel || running) return;
    run.mutate({ id: prId, start: range.start, end: range.end, model: activeModel, templateId: templateId || undefined, prompt: prompt.trim() || undefined });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-review-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <strong className="modal-title-strong"><SparkleIcon size={16} /> AI review</strong>
          <span className="split-base-head"><code>{range.start.slice(0, 7)}</code> → <code>{range.end.slice(0, 7)}</code></span>
          <span className="modal-header-spacer" />
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </header>
        <div className="ai-review-body">
          <div className="ai-review-form">
            <label>Template
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">(none)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
            <label>Model
              <select value={activeModel} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <textarea
              className="comment-textarea"
              placeholder="Optional: focus the review…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={start} disabled={running}>
              {running ? "Reviewing… (this can take a while)" : "Run review"}
            </button>
            {running && (
              <p className="notice ai-review-running">
                <span className="chat-spinner" aria-hidden="true" /> Running in the background — you can close this and keep reviewing; it will finish and appear below.
              </p>
            )}
          </div>
          {run.error && <p className="notice chat-error">{run.error.message}</p>}
          <div className="ai-review-past">
            <div className="chat-role">Reviews for this range</div>
            {reviews.data?.length ? reviews.data.map((r, i) => (
              // Expand the newest review by default so a just-finished (or
              // clicked-through) review is shown without an extra click.
              <details key={r.id} className="ai-review-item disclosure" open={i === (reviews.data?.length ?? 0) - 1}>
                <summary><ChevronRightIcon size={13} className="disclosure-chevron" /> {r.model}{r.template ? ` · ${r.template}` : ""} · {formatCommitTime(new Date(r.createdAt).toISOString())}</summary>
                <div className="comment-body"><Markdown remarkPlugins={[remarkGfm]}>{r.body}</Markdown></div>
              </details>
            )) : <p className="notice">No reviews for this range yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
