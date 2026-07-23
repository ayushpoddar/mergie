import type { CommitInfo } from "@/services/git.ts";
import type { CodeResult } from "@/services/symbols.ts";
import type { ChatMessageRow, ChatScopeKind, ChatSessionRow } from "@/db/repositories/chatSessions.ts";
import type { ArtifactRow } from "@/db/repositories/artifacts.ts";
import type { AiReviewRow } from "@/db/repositories/aiReviews.ts";
import type { AiReviewStatus } from "./aiReviewTracker.ts";
import type { ModelChoice, ReviewTemplate } from "@/domain/config.ts";
import type { PrState } from "@/services/ghPr.ts";

/** Options for running an AI review of a commit range. */
export interface AiReviewOptions {
  /** Model id to run. */
  model: string;
  /** Optional config template id to base the review on. */
  templateId?: string;
  /** Optional user prompt to focus the review. */
  prompt?: string;
}

/** A commit range an AI turn / artifact is linked to. */
export interface ChatRange {
  /** Range baseline SHA. */
  start: string;
  /** Range end SHA. */
  end: string;
}

/**
 * A live event streamed during a chat turn:
 * - `delta`: an incremental chunk of the assistant's reply text.
 * - `activity`: a human-readable note that the agent is using a tool.
 */
export interface LiveChatEvent {
  /** Which kind of live event this is. */
  kind: "delta" | "activity";
  /** The delta text, or the activity description. */
  text: string;
}
import type { Range } from "@/domain/ranges.ts";
import type { ReviewedRangeRow } from "@/db/repositories/reviewedRanges.ts";
import type { CommentRow, CommentSide, CommentKind } from "@/db/repositories/comments.ts";
import type { AllCommentEntry } from "./allComments.ts";
import type { FileView } from "./reviewService.ts";
import type { SplitRow } from "./splitView.ts";

/** Input to create a new comment (server derives the anchor hash). */
export interface NewComment {
  /** Whether the comment targets a line or the whole hunk. */
  kind: CommentKind;
  /** Which diff side it applies to. */
  side: CommentSide;
  /** Repo-relative file path. */
  path: string;
  /** Markdown body. */
  body: string;
  /** The end commit of the range the comment was made in. */
  madeAtSha: string;
  /** For `lines`: the exact text of the commented line. */
  lineText?: string;
  /** For `lines`: the first line number on the comment's side. */
  lineNo?: number;
  /** For `lines`: the last line number on the comment's side (defaults to lineNo). */
  endLineNo?: number;
  /** For `hunk`: the hunk's content hash. */
  hunkHash?: string;
}

/**
 * Which commit a comment should be anchored to when posting to GitHub.
 *
 * - `'end'` — the range's end commit (pins to exactly what was reviewed).
 * - `'head'` — the PR's head commit (the comment stays "live").
 */
export type PostTarget = "end" | "head";

/**
 * The result of resolving where a comment would land if posted to GitHub.
 * Used both to preview (warn before posting) and to drive the actual post.
 */
export interface PostPreview {
  /** Whether the comment can be posted at the chosen target. */
  canPost: boolean;
  /** The commit SHA the comment would be anchored to. */
  commitId: string;
  /** The diff side the comment would post on. */
  side: CommentSide;
  /** The last (or only) line number, or null when it cannot be resolved. */
  line: number | null;
  /** First line of a multi-line span, or null for a single-line comment. */
  startLine: number | null;
  /** A human-readable reason the comment cannot be posted; null when postable. */
  warning: string | null;
}

/** Whole-PR review progress, counted in hunks. */
export interface PrProgress {
  /** Hunks marked viewed across the whole PR (baseline → head). */
  viewed: number;
  /** Total hunks in the whole PR (lock/generated files included). */
  total: number;
}

/** A PR's commit topology for the range selector. */
export interface CommitsWithBaseline {
  /** The "before-PR" baseline SHA (merge-base with the target branch). */
  baselineSha: string;
  /** PR commits, oldest → newest. */
  commits: CommitInfo[];
}

/** Per-PR review operations (backed by the PR's clone + database). */
export interface Workspace {
  /** The public PR summary. */
  pr: LoadedPr;
  /** Stamp this PR as opened now (drives the "recently reviewed" ordering). */
  touch(): void;
  /**
   * Whole-PR review progress (viewed vs. total hunks, baseline → head). The
   * total hunk set is computed once (cloning if needed) and cached; the viewed
   * count is re-read each call so it reflects the latest marks.
   */
  reviewProgress(): Promise<PrProgress>;
  /** The selectable models and review templates from config. */
  config(): { models: ModelChoice[]; templates: ReviewTemplate[] };
  /**
   * Re-fetch the PR's metadata from GitHub and its git objects, picking up any
   * new commits / head movement and an updated title/base.
   */
  refresh(): Promise<void>;
  /** PR commits mapped from metadata (no clone required). */
  commits(): CommitInfo[];
  /** Commit topology (baseline + commits) for range selection (clones lazily). */
  commitsWithBaseline(): Promise<CommitsWithBaseline>;
  /** The default range to show on open (last-reviewed → head, else whole PR). */
  defaultRange(): Promise<Range>;
  /**
   * Assemble the file/hunk view for a commit range.
   *
   * @param ignoreWhitespace - When true, collapse whitespace-only changes so a
   *   line/hunk that differs only in spacing no longer appears as changed.
   */
  rangeView(startSha: string, endSha: string, ignoreWhitespace?: boolean): Promise<FileView[]>;
  /** Set or clear a hunk's viewed state (by hunk hash). */
  setHunkViewed(hunkHash: string, viewed: boolean): void;
  /** Mark a commit range reviewed. */
  addReviewedRange(startSha: string, endSha: string): void;
  /** Un-mark a reviewed range by its exact (startSha, endSha) pair. */
  removeReviewedRange(startSha: string, endSha: string): void;
  /** List reviewed ranges (oldest → newest). */
  listReviewedRanges(): ReviewedRangeRow[];
  /** Create a comment; returns its id. */
  addComment(input: NewComment): number;
  /** Edit a comment's body; propagates to GitHub if the comment was posted. */
  editComment(id: number, body: string): Promise<void>;
  /** Delete a comment; also deletes it on GitHub if it was posted. */
  deleteComment(id: number): Promise<void>;
  /** All comments for this PR. */
  listComments(): CommentRow[];
  /**
   * Unified list for the "All comments" view: local comments merged with
   * fetched GitHub threads (deduped by GitHub id), classified by origin and
   * authorship. Async because it resolves the viewer's GitHub login.
   */
  listAllComments(): Promise<AllCommentEntry[]>;
  /** Resolve where a comment would post (line + warnings) without posting. */
  postCommentPreview(id: number, target: PostTarget): Promise<PostPreview>;
  /** Post a comment to GitHub; records the GitHub id/url on success. */
  postComment(id: number, target: PostTarget): Promise<{ githubId: string; githubUrl: string }>;
  /** Pull GitHub inline comments into the local cache; returns the count synced. */
  syncGithub(): Promise<number>;
  /** Reply to a GitHub thread (by root comment id) and refresh the cache. */
  replyToThread(rootGithubId: string, body: string): Promise<void>;
  /**
   * Edit a GitHub comment (by GitHub id) that the viewer authored, updating it
   * on GitHub and in the local cache. Refuses comments authored by others.
   */
  editGithubComment(githubId: string, body: string): Promise<void>;
  /**
   * Delete a GitHub comment (by GitHub id) that the viewer authored, on GitHub
   * and from the local cache. Refuses comments authored by others.
   */
  deleteGithubComment(githubId: string): Promise<void>;
  /**
   * Definition of a symbol (via `sem`) at the given commit's checkout.
   * `file` (repo-relative) scopes the lookup; if the scoped call is empty it
   * retries unscoped.
   */
  symbolDefinition(symbol: string, sha: string, file?: string): Promise<CodeResult[]>;
  /**
   * Usages of a symbol (via `sem`) at the given commit's checkout, resolved to
   * the real reference lines within each dependent. `file` scopes as above.
   */
  symbolUsages(symbol: string, sha: string, file?: string): Promise<CodeResult[]>;
  /**
   * Literal (default) or regex word search (via `rg`) at a commit's checkout.
   * @param opts - `caseSensitive` (default false), `regex` (default false).
   */
  symbolSearch(word: string, sha: string, opts?: { caseSensitive?: boolean; regex?: boolean }): Promise<CodeResult[]>;
  /** Full text of a file at a commit (null if absent/binary). */
  fileAt(sha: string, path: string): Promise<string | null>;
  /** Start an AI chat session scoped to a hunk or file; returns its id. */
  createChatSession(scopeKind: ChatScopeKind, scopeRef: string, model: string, title?: string): number;
  /** List chat sessions, optionally filtered to a scope. */
  listChatSessions(scopeKind?: ChatScopeKind, scopeRef?: string): ChatSessionRow[];
  /** List messages for a chat session (oldest first). */
  listChatMessages(sessionId: number): ChatMessageRow[];
  /**
   * Run one agentic chat turn: persist the user prompt, stream live events via
   * `onEvent` (`delta` = incremental reply text; `activity` = a note that the
   * agent is using a tool), persist the full reply, and return it. When a
   * `range` is given, any files the agent writes to the artifacts folder are
   * captured and linked to that commit range.
   */
  streamChat(sessionId: number, prompt: string, onEvent: (ev: LiveChatEvent) => void, range?: ChatRange): Promise<string>;
  /** List generated artifacts, optionally scoped to a commit range. */
  listArtifacts(range?: ChatRange): ArtifactRow[];
  /** Absolute path of an artifact file if it exists within the artifacts dir. */
  resolveArtifact(relPath: string): string | null;
  /** Run an AI review of a commit range; persists and returns the result. */
  runAiReview(range: ChatRange, opts: AiReviewOptions): Promise<AiReviewRow>;
  /** List AI reviews, optionally scoped to a commit range. */
  listAiReviews(range?: ChatRange): AiReviewRow[];
  /**
   * Snapshot of in-flight and recently-completed AI reviews for this PR, keyed
   * by range. Powers the app-level progress indicator; completed entries linger
   * until dismissed.
   */
  aiReviewStatuses(): AiReviewStatus[];
  /** Dismiss a completed (done/failed) AI-review status for a range. */
  dismissAiReviewStatus(range: ChatRange): void;
  /**
   * Full-file side-by-side split rows for a path over a range.
   *
   * @param ignoreWhitespace - When true, collapse whitespace-only changes.
   */
  fileSplit(path: string, startSha: string, endSha: string, ignoreWhitespace?: boolean): Promise<SplitRow[]>;
}

/** A pull request loaded into the daemon. */
export interface LoadedPr {
  /** Stable id for routing/UI (e.g. `owner_repo_number`). */
  id: string;
  /** The original PR URL. */
  url: string;
  /** Repository owner. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** PR number. */
  number: number;
  /** PR title (from GitHub). */
  title: string;
  /** PR description / body (from GitHub), as GitHub-flavored markdown.
   * Empty string when the PR has no description. Kept current by Refresh PR. */
  body: string;
  /** Target branch the PR merges into. */
  baseRef: string;
  /** Source branch the PR merges from. */
  headRef: string;
  /** Number of commits in the PR. */
  commitCount: number;
  /** Lines added across the whole PR (base → head). */
  additions: number;
  /** Lines deleted across the whole PR (base → head). */
  deletions: number;
  /** Files changed across the whole PR. */
  changedFiles: number;
  /** ISO-8601 timestamp the PR was opened on GitHub. */
  createdAtIso: string;
  /** ISO-8601 timestamp of the PR's last GitHub update. Kept current by Refresh. */
  updatedAtIso: string;
  /** GitHub login of the PR author. */
  authorLogin: string;
  /** Lifecycle state on GitHub: open, closed (unmerged), or merged.
   * Set at load, refreshed by Refresh PR, and re-checked when the picker opens. */
  state: PrState;
  /** Epoch-ms when this PR was last opened in mergie (drives list ordering). */
  lastOpenedAtMs: number;
}

/** Manages the set of PRs the daemon is serving. */
export interface PrRegistry {
  /** Load (or attach to an already-loaded) PR by URL. */
  loadPr(url: string): Promise<LoadedPr>;
  /** All currently-loaded PRs, most-recently-opened first. */
  listPrs(): LoadedPr[];
  /** Stamp a loaded PR as opened now; a no-op for an unknown id. */
  touchPr(id: string): void;
  /**
   * Overwrite the cached lifecycle state of loaded PRs from a map keyed by PR
   * id. Unknown ids are ignored. Used to fold a fresh status re-check back into
   * the registry so it persists for later reads.
   */
  applyStates(states: Record<string, PrState>): void;
  /** Whole-PR review progress for a loaded PR (throws if not loaded). */
  prProgress(id: string): Promise<PrProgress>;
  /** A loaded PR by id, or undefined. */
  getPr(id: string): LoadedPr | undefined;
  /** Commits belonging to a loaded PR, oldest → newest. */
  commits(id: string): Promise<CommitInfo[]>;
  /** The review workspace for a loaded PR, or undefined if not loaded. */
  getWorkspace(id: string): Workspace | undefined;
  /**
   * Wait for in-flight AI operations (chat turns, reviews) to finish before
   * shutdown, up to `timeoutMs`. Resolves `true` if they drained, `false` on
   * timeout.
   */
  drainAi(timeoutMs: number): Promise<boolean>;
}
