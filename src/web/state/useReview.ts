import { useState } from "react";
import { trpc } from "../trpc.ts";
import type { CommitInfo } from "@/services/git.ts";
import type { FileView } from "@/daemon/reviewService.ts";
import type { ReviewedRangeRow } from "@/db/repositories/reviewedRanges.ts";
import type { PostPreview, PostTarget } from "@/daemon/registry.ts";

/** A selected commit range. */
export interface RangeSel {
  /** Baseline (excluded) SHA. */
  start: string;
  /** End (inclusive) SHA. */
  end: string;
}

/** Arguments for creating a comment (PR id is injected by the hook). */
export interface AddCommentArgs {
  /** Line range or whole hunk. */
  kind: "lines" | "hunk";
  /** Diff side. */
  side: "LEFT" | "RIGHT";
  /** File path. */
  path: string;
  /** Markdown body. */
  body: string;
  /** End commit of the current range. */
  madeAtSha: string;
  /** Exact line text (for line comments). */
  lineText?: string;
  /** First side line number (for line comments). */
  lineNo?: number;
  /** Last side line number (for multi-line comments). */
  endLineNo?: number;
  /** Hunk content hash (for hunk comments). */
  hunkHash?: string;
}

/** Everything the review UI needs for one PR. */
export interface ReviewState {
  baselineSha: string | null;
  commits: CommitInfo[];
  range: RangeSel | null;
  setRange: (r: RangeSel) => void;
  files: FileView[];
  loading: boolean;
  reviewedRanges: ReviewedRangeRow[];
  toggleHunkViewed: (hunkHash: string, viewed: boolean) => void;
  markReviewed: () => void;
  /** Un-mark the currently selected range as reviewed. */
  unmarkReviewed: () => void;
  addComment: (args: AddCommentArgs) => void;
  editComment: (commentId: number, body: string) => void;
  deleteComment: (commentId: number) => void;
  /** Preview where a comment would post (line + warning) without posting. */
  previewPost: (commentId: number, target: PostTarget) => Promise<PostPreview>;
  /** Post a comment to GitHub at the chosen target. */
  postComment: (commentId: number, target: PostTarget) => void;
  /** Re-fetch the PR from GitHub (new commits / head movement). */
  refreshPr: () => void;
  /** True while a PR refresh is in flight. */
  refreshing: boolean;
  /** Reply to a synced GitHub thread by its root comment id. */
  replyToThread: (rootGithubId: string, body: string) => void;
}

/**
 * Load and manage review state for a PR: commit topology, the selected range
 * (defaulting to last-reviewed→head), the range's file/hunk view, and the
 * mutations for viewed state and reviewed ranges.
 */
export function useReview(prId: string, initialRange?: RangeSel | null, hideWhitespace = false): ReviewState {
  const utils = trpc.useUtils();
  const topo = trpc.commitsWithBaseline.useQuery({ id: prId });
  const def = trpc.defaultRange.useQuery({ id: prId });
  const [override, setOverride] = useState<RangeSel | null>(initialRange ?? null);

  const range: RangeSel | null =
    override ?? (def.data ? { start: def.data.startSha, end: def.data.endSha } : null);

  // `ignoreWhitespace` is part of the query key, so toggling it re-fetches the
  // diff (git re-diffs with `--ignore-all-space`), collapsing whitespace-only
  // hunks. Viewed-progress is keyed to each mode's hunk content, so it does not
  // carry between the two modes — intentional, and lossless on round-trip.
  const view = trpc.rangeView.useQuery(
    { id: prId, start: range?.start ?? "", end: range?.end ?? "", ignoreWhitespace: hideWhitespace },
    { enabled: range !== null },
  );
  const reviewed = trpc.listReviewedRanges.useQuery({ id: prId });
  const setViewed = trpc.setHunkViewed.useMutation({ onSuccess: () => utils.rangeView.invalidate() });
  const addReviewed = trpc.addReviewedRange.useMutation({ onSuccess: () => utils.listReviewedRanges.invalidate() });
  const removeReviewed = trpc.removeReviewedRange.useMutation({ onSuccess: () => utils.listReviewedRanges.invalidate() });
  const invalidateView = (): void => {
    void utils.rangeView.invalidate();
    void utils.listComments.invalidate();
    // The All-comments side panel shares the screen now, so keep it in sync
    // when comments change from the diff (add / edit / delete / post / sync).
    void utils.listAllComments.invalidate();
  };
  const addC = trpc.addComment.useMutation({ onSuccess: invalidateView });
  const editC = trpc.editComment.useMutation({ onSuccess: invalidateView });
  const delC = trpc.deleteComment.useMutation({ onSuccess: invalidateView });
  const postC = trpc.postComment.useMutation({ onSuccess: invalidateView });
  const reply = trpc.replyToThread.useMutation({ onSuccess: invalidateView });
  const refresh = trpc.refreshPr.useMutation({
    onSuccess: () => {
      void utils.commitsWithBaseline.invalidate();
      void utils.defaultRange.invalidate();
      void utils.prCommits.invalidate();
      void utils.health.invalidate();
      invalidateView();
    },
  });

  return {
    baselineSha: topo.data?.baselineSha ?? null,
    commits: topo.data?.commits ?? [],
    range,
    setRange: setOverride,
    files: view.data ?? [],
    loading: topo.isLoading || def.isLoading || view.isLoading,
    reviewedRanges: reviewed.data ?? [],
    toggleHunkViewed: (hunkHash, viewed) => setViewed.mutate({ id: prId, hunkHash, viewed }),
    markReviewed: () => {
      if (range) addReviewed.mutate({ id: prId, start: range.start, end: range.end });
    },
    unmarkReviewed: () => {
      if (range) removeReviewed.mutate({ id: prId, start: range.start, end: range.end });
    },
    addComment: (args) => addC.mutate({ id: prId, ...args }),
    editComment: (commentId, body) => editC.mutate({ id: prId, commentId, body }),
    deleteComment: (commentId) => delC.mutate({ id: prId, commentId }),
    previewPost: (commentId, target) => utils.postCommentPreview.fetch({ id: prId, commentId, target }),
    postComment: (commentId, target) => postC.mutate({ id: prId, commentId, target }),
    replyToThread: (rootGithubId, body) => reply.mutate({ id: prId, rootGithubId, body }),
    refreshPr: () => refresh.mutate({ id: prId }),
    refreshing: refresh.isPending,
  };
}
