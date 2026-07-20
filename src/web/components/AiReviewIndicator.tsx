import { trpc } from "../trpc.ts";
import { summariseAiReviewStatuses } from "@/web/lib/aiReviewIndicator.ts";
import { SparkleIcon, CheckIcon, CloseIcon } from "./Icons.tsx";
import type { RangeSel } from "../state/useReview.ts";

/** Short label for a range's SHAs. */
function rangeLabel(startSha: string, endSha: string): string {
  return `${startSha.slice(0, 7)} → ${endSha.slice(0, 7)}`;
}

/**
 * A persistent, app-level indicator of AI-review progress for this PR. It polls
 * the daemon's per-range review statuses so it stays accurate after the review
 * popup is closed and across range changes. Shows a spinner while a review runs
 * (with a count when several run), a clickable "ready" state that opens the
 * finished review, or a clickable "failed" state — both of which dismiss the
 * status once acted on. Renders nothing when idle.
 */
export function AiReviewIndicator(props: {
  prId: string;
  /** Open the AI-review popup on a given range (e.g. a finished review). */
  onOpen: (range: RangeSel) => void;
}): React.JSX.Element | null {
  const { prId, onOpen } = props;
  const utils = trpc.useUtils();
  const statuses = trpc.aiReviewStatuses.useQuery({ id: prId }, { refetchInterval: 2000 });
  const dismiss = trpc.dismissAiReviewStatus.useMutation({
    onSuccess: () => utils.aiReviewStatuses.invalidate(),
  });

  const summary = summariseAiReviewStatuses(statuses.data ?? []);
  if (!summary) return null;
  const { state, runningCount, primary } = summary;
  const range: RangeSel = { start: primary.startSha, end: primary.endSha };
  const label: string = rangeLabel(primary.startSha, primary.endSha);

  if (state === "running") {
    return (
      <span className="ai-indicator ai-indicator-running" title={`AI review in progress · ${label}`}>
        <span className="chat-spinner" aria-hidden="true" />
        AI review running{runningCount > 1 ? ` (${runningCount})` : ""}
      </span>
    );
  }

  const act = (): void => {
    onOpen(range);
    dismiss.mutate({ id: prId, start: primary.startSha, end: primary.endSha });
  };

  if (state === "done") {
    return (
      <button type="button" className="ai-indicator ai-indicator-done" title={`Open the finished AI review · ${label}`} onClick={act}>
        <SparkleIcon size={13} /> AI review ready <CheckIcon size={13} />
      </button>
    );
  }
  return (
    <button type="button" className="ai-indicator ai-indicator-failed" title={primary.error ?? "AI review failed"} onClick={act}>
      <CloseIcon size={13} /> AI review failed
    </button>
  );
}
