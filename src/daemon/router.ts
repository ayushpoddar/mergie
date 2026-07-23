import { z } from "zod";
import { publicProcedure, router } from "./trpc.ts";
import { sizeKey } from "@/services/ghSearch.ts";
import type { Context } from "./trpc.ts";
import type { Workspace } from "./registry.ts";
import type { PrState } from "@/services/ghPr.ts";

/** Resolve a loaded PR's workspace or throw a NOT_FOUND-style error. */
function workspaceOrThrow(ctx: Context, id: string): Workspace {
  const ws = ctx.registry.getWorkspace(id);
  if (!ws) throw new Error(`PR not loaded: ${id}`);
  return ws;
}

/** Input schema carrying a PR id. */
const prInput = z.object({ id: z.string().min(1) });
/** Input schema carrying a PR id + a commit range. */
const rangeInput = z.object({ id: z.string().min(1), start: z.string().min(1), end: z.string().min(1) });

/**
 * The mergie tRPC router. End-to-end typed; the React UI infers its client
 * types from `AppRouter`. New feature areas (diff, comments, symbols, ai) are
 * added here as nested routers.
 */
export const appRouter = router({
  /** Liveness + the set of loaded PRs. */
  health: publicProcedure.query(({ ctx }) => ({ ok: true, prs: ctx.registry.listPrs() })),

  /** List loaded PRs. */
  listPrs: publicProcedure.query(({ ctx }) => ctx.registry.listPrs()),

  /** Open PRs authored by / assigned to / review-requested from the viewer. */
  listMyPrs: publicProcedure.query(({ ctx }) => ctx.search.listMyPrs()),

  /** Diff-sizes for many GitHub-listed PRs, batched (keyed `owner/repo/number`). */
  prSizes: publicProcedure
    .input(z.object({ refs: z.array(z.object({ owner: z.string(), repo: z.string(), number: z.number() })) }))
    .query(({ ctx, input }) => ctx.search.prSizes(input.refs)),

  /** Stamp a loaded PR as opened now (updates the recently-reviewed ordering). */
  touchPr: publicProcedure
    .input(prInput)
    .mutation(({ ctx, input }) => {
      ctx.registry.touchPr(input.id);
      return { ok: true };
    }),

  /** Whole-PR review progress (viewed vs. total hunks) for a loaded PR. */
  prProgress: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => ctx.registry.prProgress(input.id)),

  /**
   * Re-check the current GitHub state (open/closed/merged) of every loaded PR
   * in one batched call, fold the result back into the registry so it persists,
   * and return the states keyed by PR id. Driven when the PR picker opens.
   */
  prStates: publicProcedure.query(async ({ ctx }): Promise<Record<string, PrState>> => {
    const prs = ctx.registry.listPrs();
    const byRefKey = await ctx.search.prStates(
      prs.map((p) => ({ owner: p.owner, repo: p.repo, number: p.number })),
    );
    const byId: Record<string, PrState> = {};
    for (const p of prs) {
      const state = byRefKey[sizeKey(p)];
      if (state) byId[p.id] = state;
    }
    ctx.registry.applyStates(byId);
    return byId;
  }),

  /** Load (or attach to) a PR by URL. */
  loadPr: publicProcedure
    .input(z.object({ url: z.string().min(1) }))
    .mutation(({ ctx, input }) => ctx.registry.loadPr(input.url)),

  /** Re-fetch a loaded PR (new commits / head movement) from GitHub. */
  refreshPr: publicProcedure
    .input(prInput)
    .mutation(async ({ ctx, input }) => {
      await workspaceOrThrow(ctx, input.id).refresh();
      return { ok: true };
    }),

  /** Commits of a loaded PR, oldest → newest (no clone required). */
  prCommits: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => ctx.registry.commits(input.id)),

  /** Commit topology (baseline + commits) for the range selector. */
  commitsWithBaseline: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).commitsWithBaseline()),

  /** The default range to show on open. */
  defaultRange: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).defaultRange()),

  /** The file/hunk view for a commit range. */
  rangeView: publicProcedure
    .input(rangeInput.extend({ ignoreWhitespace: z.boolean().optional() }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).rangeView(input.start, input.end, input.ignoreWhitespace)),

  /** Set or clear a hunk's viewed state. */
  setHunkViewed: publicProcedure
    .input(z.object({ id: z.string().min(1), hunkHash: z.string().min(1), viewed: z.boolean() }))
    .mutation(({ ctx, input }) => {
      workspaceOrThrow(ctx, input.id).setHunkViewed(input.hunkHash, input.viewed);
      return { ok: true };
    }),

  /** Mark a commit range reviewed. */
  addReviewedRange: publicProcedure
    .input(rangeInput)
    .mutation(({ ctx, input }) => {
      workspaceOrThrow(ctx, input.id).addReviewedRange(input.start, input.end);
      return { ok: true };
    }),

  /** Un-mark a reviewed commit range. */
  removeReviewedRange: publicProcedure
    .input(rangeInput)
    .mutation(({ ctx, input }) => {
      workspaceOrThrow(ctx, input.id).removeReviewedRange(input.start, input.end);
      return { ok: true };
    }),

  /** List reviewed ranges. */
  listReviewedRanges: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).listReviewedRanges()),

  /** All comments for a PR. */
  listComments: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).listComments()),

  /** Unified list (local + fetched GitHub, deduped) for the "All comments" view. */
  listAllComments: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).listAllComments()),

  /** Full-file side-by-side split rows for a path over a range. */
  fileSplit: publicProcedure
    .input(z.object({ id: z.string().min(1), path: z.string().min(1), start: z.string().min(1), end: z.string().min(1), ignoreWhitespace: z.boolean().optional() }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).fileSplit(input.path, input.start, input.end, input.ignoreWhitespace)),

  /** Create a comment on a line or a whole hunk. */
  addComment: publicProcedure
    .input(z.object({
      id: z.string().min(1),
      kind: z.enum(["lines", "hunk"]),
      side: z.enum(["LEFT", "RIGHT"]),
      path: z.string().min(1),
      body: z.string().min(1),
      madeAtSha: z.string().min(1),
      lineText: z.string().optional(),
      lineNo: z.number().optional(),
      endLineNo: z.number().optional(),
      hunkHash: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...comment } = input;
      return { id: workspaceOrThrow(ctx, id).addComment(comment) };
    }),

  /** Edit a comment's body (propagates to GitHub if posted). */
  editComment: publicProcedure
    .input(z.object({ id: z.string().min(1), commentId: z.number(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await workspaceOrThrow(ctx, input.id).editComment(input.commentId, input.body);
      return { ok: true };
    }),

  /** Delete a comment (also deletes on GitHub if posted). */
  deleteComment: publicProcedure
    .input(z.object({ id: z.string().min(1), commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await workspaceOrThrow(ctx, input.id).deleteComment(input.commentId);
      return { ok: true };
    }),

  /** Preview where a comment would post to GitHub (line + any warning). */
  postCommentPreview: publicProcedure
    .input(z.object({ id: z.string().min(1), commentId: z.number(), target: z.enum(["end", "head"]) }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).postCommentPreview(input.commentId, input.target)),

  /** Post a comment to GitHub as a single inline comment. */
  postComment: publicProcedure
    .input(z.object({ id: z.string().min(1), commentId: z.number(), target: z.enum(["end", "head"]) }))
    .mutation(({ ctx, input }) => workspaceOrThrow(ctx, input.id).postComment(input.commentId, input.target)),

  /** Pull GitHub inline comments into the local cache. */
  syncGithub: publicProcedure
    .input(prInput)
    .mutation(async ({ ctx, input }) => ({ synced: await workspaceOrThrow(ctx, input.id).syncGithub() })),

  /** Reply to a GitHub inline thread by its root comment id. */
  replyToThread: publicProcedure
    .input(z.object({ id: z.string().min(1), rootGithubId: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await workspaceOrThrow(ctx, input.id).replyToThread(input.rootGithubId, input.body);
      return { ok: true };
    }),

  /** Edit a GitHub comment (by GitHub id) the viewer authored. */
  editGithubComment: publicProcedure
    .input(z.object({ id: z.string().min(1), githubId: z.string().min(1), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await workspaceOrThrow(ctx, input.id).editGithubComment(input.githubId, input.body);
      return { ok: true };
    }),

  /** Delete a GitHub comment (by GitHub id) the viewer authored. */
  deleteGithubComment: publicProcedure
    .input(z.object({ id: z.string().min(1), githubId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await workspaceOrThrow(ctx, input.id).deleteGithubComment(input.githubId);
      return { ok: true };
    }),

  /** Definition of a symbol via `sem`, at a commit's checkout (optional file scope). */
  symbolDefinition: publicProcedure
    .input(z.object({ id: z.string().min(1), symbol: z.string().min(1), sha: z.string().min(1), file: z.string().min(1).optional() }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).symbolDefinition(input.symbol, input.sha, input.file)),

  /** Usages of a symbol via `sem`, at a commit's checkout (optional file scope). */
  symbolUsages: publicProcedure
    .input(z.object({ id: z.string().min(1), symbol: z.string().min(1), sha: z.string().min(1), file: z.string().min(1).optional() }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).symbolUsages(input.symbol, input.sha, input.file)),

  /** Literal (default) or regex word search via `rg`, at a commit's checkout. */
  symbolSearch: publicProcedure
    .input(z.object({
      id: z.string().min(1), word: z.string().min(1), sha: z.string().min(1),
      caseSensitive: z.boolean().optional(), regex: z.boolean().optional(),
    }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).symbolSearch(input.word, input.sha, { caseSensitive: input.caseSensitive, regex: input.regex })),

  /** Full text of a file at a commit (for a symbol result's full-file popup). */
  fileAt: publicProcedure
    .input(z.object({ id: z.string().min(1), sha: z.string().min(1), path: z.string().min(1) }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).fileAt(input.sha, input.path)),

  /** The selectable models + review templates from config. */
  config: publicProcedure
    .input(prInput)
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).config()),

  /** Start an AI chat session scoped to a hunk or file. */
  createChatSession: publicProcedure
    .input(z.object({
      id: z.string().min(1),
      scopeKind: z.enum(["hunk", "file"]),
      scopeRef: z.string().min(1),
      model: z.string().min(1),
      title: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => ({
      sessionId: workspaceOrThrow(ctx, input.id).createChatSession(input.scopeKind, input.scopeRef, input.model, input.title),
    })),

  /** List chat sessions, optionally scoped to a hunk/file. */
  listChatSessions: publicProcedure
    .input(z.object({ id: z.string().min(1), scopeKind: z.enum(["hunk", "file"]).optional(), scopeRef: z.string().optional() }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).listChatSessions(input.scopeKind, input.scopeRef)),

  /** Messages for a chat session. */
  listChatMessages: publicProcedure
    .input(z.object({ id: z.string().min(1), sessionId: z.number() }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).listChatMessages(input.sessionId)),

  /** AI-generated artifacts, optionally scoped to a commit range. */
  listArtifacts: publicProcedure
    .input(z.object({ id: z.string().min(1), start: z.string().optional(), end: z.string().optional() }))
    .query(({ ctx, input }) => {
      const range = input.start && input.end ? { start: input.start, end: input.end } : undefined;
      return workspaceOrThrow(ctx, input.id).listArtifacts(range);
    }),

  /** Run an AI review of a commit range (blocks until complete). */
  runAiReview: publicProcedure
    .input(z.object({
      id: z.string().min(1),
      start: z.string().min(1),
      end: z.string().min(1),
      model: z.string().min(1),
      templateId: z.string().optional(),
      prompt: z.string().optional(),
    }))
    .mutation(({ ctx, input }) => workspaceOrThrow(ctx, input.id).runAiReview(
      { start: input.start, end: input.end },
      { model: input.model, templateId: input.templateId, prompt: input.prompt },
    )),

  /** List AI reviews, optionally scoped to a commit range. */
  listAiReviews: publicProcedure
    .input(z.object({ id: z.string().min(1), start: z.string().optional(), end: z.string().optional() }))
    .query(({ ctx, input }) => {
      const range = input.start && input.end ? { start: input.start, end: input.end } : undefined;
      return workspaceOrThrow(ctx, input.id).listAiReviews(range);
    }),

  /** In-flight / recently-completed AI-review statuses for this PR (for the header indicator). */
  aiReviewStatuses: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => workspaceOrThrow(ctx, input.id).aiReviewStatuses()),

  /** Dismiss a completed AI-review status once the user has acted on it. */
  dismissAiReviewStatus: publicProcedure
    .input(z.object({ id: z.string().min(1), start: z.string().min(1), end: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      workspaceOrThrow(ctx, input.id).dismissAiReviewStatus({ start: input.start, end: input.end });
      return { dismissed: true };
    }),

  /** Stop the daemon. */
  stop: publicProcedure.mutation(({ ctx }) => {
    ctx.requestStop();
    return { stopping: true };
  }),
});

/** Type of the mergie router, consumed by the typed client. */
export type AppRouter = typeof appRouter;
