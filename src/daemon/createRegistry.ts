import { mkdirSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { parsePrUrl, type PullRequestRef } from "@/domain/url.ts";
import { artifactsDir, cloneDir, dataDir, dbPath, type PathEnv } from "@/domain/paths.ts";
import { defaultConfig, loadConfig, type MergieConfig } from "@/domain/config.ts";
import { resolveDefaultRange, type Range } from "@/domain/ranges.ts";
import { commentAnchorHash } from "@/domain/hash.ts";
import { openDatabase } from "@/db/migrate.ts";
import { hunkViewsRepo } from "@/db/repositories/hunkViews.ts";
import { reviewedRangesRepo } from "@/db/repositories/reviewedRanges.ts";
import { commentsRepo } from "@/db/repositories/comments.ts";
import { githubCommentsRepo, type GithubCommentRow } from "@/db/repositories/githubComments.ts";
import { chatSessionsRepo, type ChatMessageRow, type ChatScopeKind, type ChatSessionRow } from "@/db/repositories/chatSessions.ts";
import { artifactsRepo, type ArtifactRow } from "@/db/repositories/artifacts.ts";
import { aiReviewsRepo, type AiReviewRow } from "@/db/repositories/aiReviews.ts";
import { listRelFiles, newArtifacts } from "./artifactCapture.ts";
import { buildReviewPrompt } from "./reviewPrompt.ts";
import { createInflight, type Inflight } from "./inflight.ts";
import { createAiReviewTracker, type AiReviewStatus } from "./aiReviewTracker.ts";
import type { GithubComment } from "@/services/github.ts";
import { createAiService, type AiService } from "@/services/ai.ts";
import { groupGithubThreads, type GithubThread, type GithubThreadRow } from "./githubThreads.ts";
import { mergeAllComments, type AllCommentEntry } from "./allComments.ts";
import { chatTranscript, sessionTitle } from "./chatPrompt.ts";
import { bunRunner } from "@/services/exec.ts";
import { createGitService, type CommitInfo, type GitService } from "@/services/git.ts";
import { createGhPrService, type GhPrService, type PrMeta } from "@/services/ghPr.ts";
import { createGithubService, type GithubService } from "@/services/github.ts";
import { createSymbolsService, type CodeResult, type SymbolsService } from "@/services/symbols.ts";
import { isLockfile } from "@/domain/lockfiles.ts";
import { parseUnifiedDiff } from "@/domain/diff.ts";
import { parseWordDiff, withWordChanges } from "@/domain/wordDiff.ts";
import { hunkChangedSpan, locateLineComment, toPostInput } from "./postMapping.ts";
import { buildRangeView, type FileView } from "./reviewService.ts";
import { buildSplitRows, type SplitRow } from "./splitView.ts";
import type {
  AiReviewOptions, ChatRange, CommitsWithBaseline, LiveChatEvent, LoadedPr, NewComment, PostPreview, PostTarget, PrProgress, PrRegistry, Workspace,
} from "./registry.ts";

/** Injectable dependencies for the registry (defaults use real services). */
export interface RegistryDeps {
  /** GitHub PR-metadata service. */
  ghPr?: GhPrService;
  /** Opens (and migrates) a database at a path. */
  openDb?: (path: string) => Database;
  /** Builds a git service for a clone directory. */
  makeGit?: (dir: string) => GitService;
  /** Resolved configuration (defaults to loading from disk). */
  config?: MergieConfig;
  /** Builds a GitHub inline-comment service for a PR. */
  makeGithub?: (ref: { owner: string; repo: string; number: number }) => GithubService;
  /**
   * Builds the symbol-navigation service (sem/rg). The matcher tells the
   * service which paths are lockfile/generated (used for `testOrGenerated`).
   */
  makeSymbols?: (isLockfileOrGenerated: (path: string) => boolean) => SymbolsService;
  /** Builds the AI service (Claude Agent SDK). */
  makeAi?: () => AiService;
  /** Ensures a directory exists. */
  ensureDir?: (dir: string) => void;
  /** Path resolution environment. */
  pathEnv?: PathEnv;
  /** Milliseconds clock (injectable for deterministic tests). */
  now?: () => number;
}

/** Stable per-PR id, e.g. `withastro_astro_17360`. */
function prId(ref: PullRequestRef): string {
  return `${ref.owner}_${ref.repo}_${ref.number}`;
}

/**
 * Create the real {@link PrRegistry}. Loading a PR fetches metadata from GitHub
 * and opens its per-PR database; the clone happens lazily on the first
 * operation that needs it (see {@link makeWorkspace}).
 */
export function createPrRegistry(deps: RegistryDeps = {}): PrRegistry {
  const ghPr: GhPrService = deps.ghPr ?? createGhPrService(bunRunner);
  const openDb = deps.openDb ?? openDatabase;
  const makeGit = deps.makeGit ?? ((dir: string) => createGitService(dir, bunRunner));
  const makeGithub = deps.makeGithub ?? ((ref) => createGithubService(ref, bunRunner));
  const makeSymbols = deps.makeSymbols ?? ((m: (p: string) => boolean) => createSymbolsService(bunRunner, m));
  const makeAi = deps.makeAi ?? (() => createAiService());
  const ensureDir = deps.ensureDir ?? ((dir: string) => { mkdirSync(dir, { recursive: true }); });
  const now = deps.now ?? (() => Date.now());
  const inflight: Inflight = createInflight();
  const workspaces = new Map<string, Workspace>();

  return {
    async loadPr(url: string): Promise<LoadedPr> {
      const ref: PullRequestRef = parsePrUrl(url);
      const id: string = prId(ref);
      const existing = workspaces.get(id);
      if (existing) return existing.pr;

      const meta: PrMeta = await ghPr.fetchPr(ref);
      ensureDir(dataDir(ref, deps.pathEnv));
      const db: Database = openDb(dbPath(ref, deps.pathEnv));
      const pr: LoadedPr = {
        id, url, owner: ref.owner, repo: ref.repo, number: ref.number,
        title: meta.title, body: meta.body, baseRef: meta.baseRef, headRef: meta.headRef,
        commitCount: meta.commits.length,
        additions: meta.additions, deletions: meta.deletions, changedFiles: meta.changedFiles,
        createdAtIso: meta.createdAtIso, updatedAtIso: meta.updatedAtIso, authorLogin: meta.authorLogin,
        state: meta.state,
        lastOpenedAtMs: now(),
      };
      const config: MergieConfig = deps.config ?? loadConfig(deps.pathEnv) ?? defaultConfig();
      const git: GitService = makeGit(cloneDir(ref, deps.pathEnv));
      const github: GithubService = makeGithub({ owner: ref.owner, repo: ref.repo, number: ref.number });
      const symbols: SymbolsService = makeSymbols((p) => isLockfile(p, config.lockfilePatterns));
      const ai: AiService = makeAi();
      const artifactsBase: string = artifactsDir(ref, deps.pathEnv);
      workspaces.set(id, makeWorkspace({ pr, meta, ref, ghPr, db, git, github, symbols, ai, artifactsBase, ensureDir, inflight, config, now }));
      return pr;
    },

    listPrs: () => [...workspaces.values()].map((w) => w.pr).sort((a, b) => b.lastOpenedAtMs - a.lastOpenedAtMs),
    getPr: (id) => workspaces.get(id)?.pr,
    getWorkspace: (id) => workspaces.get(id),
    touchPr: (id) => workspaces.get(id)?.touch(),
    applyStates: (states) => {
      for (const [id, state] of Object.entries(states)) {
        const ws = workspaces.get(id);
        if (ws) ws.pr.state = state;
      }
    },

    async commits(id: string): Promise<CommitInfo[]> {
      const ws = workspaces.get(id);
      if (!ws) throw new Error(`Unknown PR: ${id}`);
      return ws.commits();
    },

    async prProgress(id: string): Promise<PrProgress> {
      const ws = workspaces.get(id);
      if (!ws) throw new Error(`Unknown PR: ${id}`);
      return ws.reviewProgress();
    },

    drainAi: (timeoutMs: number) => inflight.idle(timeoutMs),
  };
}

/** Build the system prompt orienting the agent to the PR and chat scope. */
function chatSystemPrompt(pr: LoadedPr, scopeKind: ChatScopeKind, scopeRef: string, baseDir: string, artifactDir: string | null): string {
  const scope: string = scopeKind === "hunk" ? `hunk ${scopeRef}` : `file ${scopeRef}`;
  const lines: string[] = [
    `You are helping review GitHub pull request ${pr.owner}/${pr.repo} #${pr.number}: "${pr.title}".`,
    `The current working directory is the PR head checkout; the base (pre-PR) checkout is at ${baseDir}.`,
    `The user is asking about ${scope}. Answer concisely in markdown; explore the code as needed.`,
  ];
  if (artifactDir) lines.push(`If you generate any files/artifacts (e.g. an HTML explainer), save them into ${artifactDir}.`);
  return lines.join(" ");
}

/** Inputs to build a review workspace. */
interface WorkspaceInputs {
  pr: LoadedPr;
  meta: PrMeta;
  ref: PullRequestRef;
  ghPr: GhPrService;
  db: Database;
  git: GitService;
  github: GithubService;
  symbols: SymbolsService;
  ai: AiService;
  artifactsBase: string;
  ensureDir: (dir: string) => void;
  inflight: Inflight;
  config: MergieConfig;
  now: () => number;
}

/**
 * Build a {@link Workspace} that lazily clones the repo on first use and
 * exposes range/hunk/reviewed operations backed by the PR's git clone and
 * database.
 */
function makeWorkspace(input: WorkspaceInputs): Workspace {
  const { ref, ghPr, db, git, github, symbols, ai, artifactsBase, ensureDir, inflight, config, now } = input;
  // A mutable copy of the PR summary + metadata so `refresh` can update them
  // without mutating the caller's objects.
  const pr: LoadedPr = { ...input.pr };
  let meta: PrMeta = input.meta;
  const views = hunkViewsRepo(db);
  const reviewed = reviewedRangesRepo(db);
  const comments = commentsRepo(db);
  const ghComments = githubCommentsRepo(db);
  const chats = chatSessionsRepo(db);
  const artifacts = artifactsRepo(db);
  const aiReviews = aiReviewsRepo(db);
  const aiReviewTracker = createAiReviewTracker();
  // Clone over HTTPS on the PR's own host (honours GitHub Enterprise), authed by
  // the gh credential helper — reuses the user's gh login, no SSH setup needed.
  const remoteUrl = `https://${ref.host}/${ref.owner}/${ref.repo}.git`;
  let cloned = false;
  let baselineSha = "";
  // The whole-PR hunk hashes, computed once for review-progress and invalidated
  // on refresh (new commits change the diff). Viewed counts are read live.
  let cachedHunkHashes: string[] | null = null;

  async function ensureClone(): Promise<void> {
    if (cloned) return;
    await git.cloneOrFetch(remoteUrl, [`refs/pull/${ref.number}/head`, meta.baseRef]);
    baselineSha = (await git.mergeBase(`origin/${meta.baseRef}`, meta.headSha)) || meta.baseRef;
    cloned = true;
  }

  function commitShas(): string[] {
    return meta.commits.map((c) => c.sha);
  }

  function mappedCommits(): CommitInfo[] {
    return meta.commits.map((c) => ({
      sha: c.sha, shortSha: c.sha.slice(0, 7), subject: c.subject,
      authorName: c.authorName, authorEmail: "", isoDate: c.isoDate,
    }));
  }

  /** Ensure (cloning first if needed) a worktree checked out at `sha`. */
  async function worktreeFor(sha: string): Promise<string> {
    await ensureClone();
    return git.ensureWorktree(sha || meta.headSha);
  }

  /** Strip a worktree-dir prefix so hit paths are repo-relative. */
  function relTo(dir: string, path: string): string {
    const prefix = `${dir}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }

  /** Reconstruct the GitHub URL for an inline review comment from its id. */
  function commentUrl(githubId: string): string {
    return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}#discussion_r${githubId}`;
  }

  /** Group the cached inbound GitHub comments into threads for the range view. */
  function cachedThreads(): GithubThread[] {
    const rows: GithubThreadRow[] = ghComments.listAll().map((r) => ({
      githubId: r.githubId, path: r.path, side: r.side, line: r.line,
      body: r.body, author: r.author, createdAt: r.createdAt, inReplyTo: r.inReplyTo,
      htmlUrl: commentUrl(r.githubId),
    }));
    return groupGithubThreads(rows);
  }

  // The viewer's GitHub login, used to classify which fetched GitHub comments
  // are the current user's own. Cached only once successfully resolved — a
  // transient failure (e.g. a cold-start timeout) must not poison the cache
  // with an empty login for the daemon's lifetime, so we retry on next call.
  let viewerLoginCache: string | null = null;
  async function viewerLogin(): Promise<string> {
    if (viewerLoginCache !== null) return viewerLoginCache;
    const login: string = await github.viewer().catch(() => "");
    if (login !== "") viewerLoginCache = login;
    return login;
  }

  /** Map a service comment to its cache-row form (stamped with sync time). */
  function toCacheRow(c: GithubComment, syncedAt: number): GithubCommentRow {
    const createdAt: number = Date.parse(c.createdAtIso);
    return {
      githubId: String(c.id), path: c.path, side: c.side, line: c.line,
      startLine: c.startLine, commitSha: c.commitId, body: c.body, author: c.author,
      createdAt: Number.isNaN(createdAt) ? null : createdAt,
      inReplyTo: c.inReplyToId === null ? null : String(c.inReplyToId), syncedAt,
    };
  }

  /**
   * Reconcile locally-stored posted comments against a fresh GitHub fetch —
   * GitHub is the source of truth. A comment posted from mergie IS a GitHub
   * comment: update its stored body from the GitHub copy (reflecting GitHub-side
   * edits), and if its GitHub comment no longer exists (deleted on GitHub) drop
   * the local row so it neither lingers nor resurrects as an editable local draft.
   */
  function reconcilePosted(fetched: GithubComment[]): void {
    const byId = new Map<string, GithubComment>(fetched.map((c) => [String(c.id), c]));
    for (const c of comments.listAll()) {
      if (c.githubId === null) continue;
      const gh = byId.get(c.githubId);
      if (gh === undefined) comments.remove(c.id);
      else if (gh.body !== c.body) comments.update(c.id, { body: gh.body, updatedAt: now() });
    }
  }

  /**
   * Guard for GitHub-comment mutations: the cached comment must exist and be
   * authored by the viewer. Others' comments are strictly read-only.
   */
  async function assertOwnGithubComment(githubId: string): Promise<void> {
    const row = ghComments.listAll().find((r) => r.githubId === githubId);
    if (row === undefined) throw new Error(`Unknown GitHub comment: ${githubId}`);
    const login: string = await viewerLogin();
    if (login === "" || row.author !== login) {
      throw new Error("You can only edit or delete GitHub comments you authored.");
    }
  }

  /**
   * Resolve where a stored comment would land if posted at `target`: the commit
   * to anchor to and the side line number(s), by re-parsing the diff at that
   * commit and re-finding the comment's content anchor. Warns if it's absent.
   */
  async function resolvePost(id: number, target: PostTarget): Promise<PostPreview> {
    const c = comments.get(id);
    if (!c) throw new Error(`Unknown comment: ${id}`);
    await ensureClone();
    const commitId: string = target === "head" ? meta.headSha : c.madeAtSha;
    const where: string = target === "head" ? "PR head" : "range end";
    const absent = (warning: string): PostPreview => ({ canPost: false, commitId, side: c.side, line: null, startLine: null, warning });

    const raw: string = await git.rawDiff(baselineSha, commitId, [c.path]);
    const file = parseUnifiedDiff(raw).find((f) => f.newPath === c.path || f.oldPath === c.path);
    if (!file) return absent(`${c.path} is not changed at the ${where}.`);

    if (c.kind === "hunk") {
      const hunk = file.hunks.find((h) => h.hash === c.anchorHash);
      if (!hunk) return absent(`This hunk no longer matches at the ${where}.`);
      const span = hunkChangedSpan(hunk.lines, c.side);
      if (!span) return absent("The hunk has no changed lines on this side.");
      return { canPost: true, commitId, side: c.side, line: span.endNo, startLine: span.startNo < span.endNo ? span.startNo : null, warning: null };
    }

    const span = c.startLine !== null && c.endLine !== null ? c.endLine - c.startLine + 1 : 1;
    for (const hunk of file.hunks) {
      const loc = locateLineComment(c.path, hunk.lines, c.side, span, c.anchorHash);
      if (loc) return { canPost: true, commitId, side: c.side, line: loc.endNo, startLine: loc.startNo < loc.endNo ? loc.startNo : null, warning: null };
    }
    return absent(`The commented line(s) are not present at the ${where}.`);
  }

  /** Build the whole-PR (baseline → head) file view once and cache hunk hashes. */
  async function wholePrHunkHashes(): Promise<string[]> {
    if (cachedHunkHashes !== null) return cachedHunkHashes;
    await ensureClone();
    const files = await buildRangeView(
      {
        rawDiff: (s, e) => git.rawDiff(s, e, undefined, false),
        wordDiff: (s, e) => git.rawWordDiff(s, e, undefined, false),
        isViewed: (h) => views.isViewed(h),
        lockfilePatterns: config.lockfilePatterns,
        largeDiffThreshold: config.largeDiffThreshold,
        comments: comments.listAll(),
        githubThreads: cachedThreads(),
      },
      baselineSha,
      meta.headSha,
    );
    cachedHunkHashes = files.flatMap((f) => f.hunks.map((h) => h.hash));
    return cachedHunkHashes;
  }

  return {
    pr,
    touch(): void {
      pr.lastOpenedAtMs = now();
    },
    async reviewProgress(): Promise<PrProgress> {
      const hashes: string[] = await wholePrHunkHashes();
      const viewed: number = hashes.reduce((n, h) => (views.isViewed(h) ? n + 1 : n), 0);
      return { viewed, total: hashes.length };
    },
    config: () => ({ models: config.models, templates: config.templates }),
    commits: mappedCommits,
    async refresh(): Promise<void> {
      const fresh: PrMeta = await ghPr.fetchPr(ref);
      meta = fresh;
      pr.title = fresh.title;
      pr.body = fresh.body;
      pr.baseRef = fresh.baseRef;
      pr.headRef = fresh.headRef;
      pr.commitCount = fresh.commits.length;
      pr.additions = fresh.additions;
      pr.deletions = fresh.deletions;
      pr.changedFiles = fresh.changedFiles;
      pr.updatedAtIso = fresh.updatedAtIso;
      pr.authorLogin = fresh.authorLogin;
      pr.state = fresh.state;
      cachedHunkHashes = null;
      await git.cloneOrFetch(remoteUrl, [`refs/pull/${ref.number}/head`, fresh.baseRef]);
      baselineSha = (await git.mergeBase(`origin/${fresh.baseRef}`, fresh.headSha)) || fresh.baseRef;
      cloned = true;
    },
    async commitsWithBaseline(): Promise<CommitsWithBaseline> {
      await ensureClone();
      return { baselineSha, commits: mappedCommits() };
    },
    async defaultRange(): Promise<Range> {
      await ensureClone();
      return resolveDefaultRange(
        { baselineSha, commits: commitShas() },
        reviewed.list().map((r) => ({ startSha: r.startSha, endSha: r.endSha, createdAt: r.createdAt })),
      );
    },
    async rangeView(startSha: string, endSha: string, ignoreWhitespace?: boolean): Promise<FileView[]> {
      await ensureClone();
      return buildRangeView(
        {
          rawDiff: (s, e) => git.rawDiff(s, e, undefined, ignoreWhitespace),
          wordDiff: (s, e) => git.rawWordDiff(s, e, undefined, ignoreWhitespace),
          isViewed: (h) => views.isViewed(h),
          lockfilePatterns: config.lockfilePatterns,
          largeDiffThreshold: config.largeDiffThreshold,
          comments: comments.listAll(),
          githubThreads: cachedThreads(),
        },
        startSha,
        endSha,
      );
    },
    setHunkViewed(hunkHash: string, viewed: boolean): void {
      if (viewed) views.markViewed(hunkHash, now());
      else views.unmarkViewed(hunkHash);
    },
    addReviewedRange(startSha: string, endSha: string): void {
      reviewed.add(startSha, endSha, now());
    },
    removeReviewedRange(startSha: string, endSha: string): void {
      reviewed.removeByRange(startSha, endSha);
    },
    listReviewedRanges: () => reviewed.list(),
    addComment(input: NewComment): number {
      const anchorHash: string = input.kind === "hunk"
        ? (input.hunkHash ?? "")
        : commentAnchorHash(input.path, input.side, input.lineText ?? "");
      const startLine: number | null = input.kind === "lines" ? (input.lineNo ?? null) : null;
      const endLine: number | null = input.kind === "lines" ? (input.endLineNo ?? input.lineNo ?? null) : null;
      const t: number = now();
      return comments.create({
        kind: input.kind, side: input.side, path: input.path, anchorHash,
        startLine, endLine, madeAtSha: input.madeAtSha, body: input.body,
        createdAt: t, updatedAt: t, githubId: null, githubUrl: null, inReplyToGithubId: null,
      });
    },
    async editComment(id: number, body: string): Promise<void> {
      comments.update(id, { body, updatedAt: now() });
      const c = comments.get(id);
      if (c?.githubId) await github.editComment(Number(c.githubId), body);
    },
    async deleteComment(id: number): Promise<void> {
      const c = comments.get(id);
      if (c?.githubId) {
        await github.deleteComment(Number(c.githubId));
        // Also evict any cached synced-thread copy so it doesn't linger as a
        // phantom "from GitHub" entry until the next fetch reconciles it.
        ghComments.remove(c.githubId);
      }
      comments.remove(id);
    },
    listComments: () => comments.listAll(),
    async listAllComments(): Promise<AllCommentEntry[]> {
      return mergeAllComments(comments.listAll(), cachedThreads(), await viewerLogin());
    },
    postCommentPreview: (id: number, target: PostTarget) => resolvePost(id, target),
    async postComment(id: number, target: PostTarget): Promise<{ githubId: string; githubUrl: string }> {
      const preview: PostPreview = await resolvePost(id, target);
      if (!preview.canPost || preview.line === null) throw new Error(preview.warning ?? "Cannot post comment.");
      const c = comments.get(id);
      if (!c) throw new Error(`Unknown comment: ${id}`);
      const res = await github.postComment(toPostInput({
        path: c.path, side: preview.side, body: c.body, commitId: preview.commitId,
        startNo: preview.startLine ?? preview.line, endNo: preview.line,
      }));
      const githubId: string = String(res.id);
      comments.setGithub(id, { githubId, githubUrl: res.htmlUrl });
      return { githubId, githubUrl: res.htmlUrl };
    },
    async syncGithub(): Promise<number> {
      const fetched = await github.listReviewComments();
      reconcilePosted(fetched);
      const syncedAt: number = now();
      const rows: GithubCommentRow[] = fetched.map((c) => toCacheRow(c, syncedAt));
      ghComments.replaceAll(rows);
      return rows.length;
    },
    async replyToThread(rootGithubId: string, body: string): Promise<void> {
      await github.replyToComment(Number(rootGithubId), body);
      const fetched = await github.listReviewComments();
      reconcilePosted(fetched);
      const syncedAt: number = now();
      ghComments.replaceAll(fetched.map((c) => toCacheRow(c, syncedAt)));
    },
    async editGithubComment(githubId: string, body: string): Promise<void> {
      await assertOwnGithubComment(githubId);
      await github.editComment(Number(githubId), body);
      ghComments.updateBody(githubId, body);
    },
    async deleteGithubComment(githubId: string): Promise<void> {
      await assertOwnGithubComment(githubId);
      await github.deleteComment(Number(githubId));
      ghComments.remove(githubId);
    },
    async symbolDefinition(symbol: string, sha: string, file?: string): Promise<CodeResult[]> {
      const dir: string = await worktreeFor(sha);
      const readFile = (path: string): Promise<string | null> => git.fileAtRef(sha, path);
      const results = await symbols.definition(symbol, { cwd: dir, readFile, file });
      return results.map((h) => ({ ...h, path: relTo(dir, h.path) }));
    },
    async symbolUsages(symbol: string, sha: string, file?: string): Promise<CodeResult[]> {
      const dir: string = await worktreeFor(sha);
      const readFile = (path: string): Promise<string | null> => git.fileAtRef(sha, path);
      const results = await symbols.usages(symbol, { cwd: dir, readFile, file });
      return results.map((h) => ({ ...h, path: relTo(dir, h.path) }));
    },
    async symbolSearch(word: string, sha: string, opts?: { caseSensitive?: boolean; regex?: boolean }): Promise<CodeResult[]> {
      const dir: string = await worktreeFor(sha);
      const results = await symbols.search(word, { cwd: dir, caseSensitive: opts?.caseSensitive, regex: opts?.regex });
      return results.map((h) => ({ ...h, path: relTo(dir, h.path) }));
    },
    async fileAt(sha: string, path: string): Promise<string | null> {
      await ensureClone();
      return git.fileAtRef(sha, path);
    },
    createChatSession(scopeKind: ChatScopeKind, scopeRef: string, model: string, title?: string): number {
      return chats.createSession({
        scopeKind, scopeRef, model,
        title: title ?? `${scopeKind === "hunk" ? "Hunk" : "File"} chat`,
        createdAt: now(),
      });
    },
    listChatSessions(scopeKind?: ChatScopeKind, scopeRef?: string): ChatSessionRow[] {
      if (scopeKind !== undefined && scopeRef !== undefined) return chats.listSessionsByScope(scopeKind, scopeRef);
      return chats.listSessions();
    },
    listChatMessages(sessionId: number): ChatMessageRow[] {
      return chats.listMessages(sessionId);
    },
    async streamChat(sessionId: number, prompt: string, onEvent: (ev: LiveChatEvent) => void, range?: ChatRange): Promise<string> {
      const done = inflight.begin();
      try {
        const session = chats.getSession(sessionId);
        if (!session) throw new Error(`Unknown chat session: ${sessionId}`);
        // Title a fresh session after its opening prompt so sessions are distinguishable.
        if (chats.listMessages(sessionId).length === 0) chats.setTitle(sessionId, sessionTitle(prompt));
        chats.addMessage({ sessionId, role: "user", content: prompt, createdAt: now() });
        await ensureClone();
        const [headDir, baseDir] = await Promise.all([git.ensureWorktree(meta.headSha), git.ensureWorktree(baselineSha)]);
        const artifactDir: string | null = range ? join(artifactsBase, `${range.start}_${range.end}`) : null;
        if (artifactDir) ensureDir(artifactDir);
        const before = new Set<string>(artifactDir ? listRelFiles(artifactDir) : []);
        const extraDirs: string[] = artifactDir ? [baseDir, artifactDir] : [baseDir];
        const transcript: string = chatTranscript(chats.listMessages(sessionId).map((m) => ({ role: m.role, content: m.content })));
        let full = "";
        for await (const ev of ai.chat({
          prompt: transcript, model: session.model, cwd: headDir,
          additionalDirectories: extraDirs,
          systemPrompt: chatSystemPrompt(pr, session.scopeKind, session.scopeRef, baseDir, artifactDir),
        })) {
          // `text` blocks are the authoritative reply we persist; `delta`s are the
          // live token stream; `activity` narrates tool use while the agent works.
          if (ev.kind === "text") full += ev.text;
          else onEvent({ kind: ev.kind, text: ev.text });
        }
        chats.addMessage({ sessionId, role: "assistant", content: full, createdAt: now() });
        if (artifactDir && range) {
          const rows = newArtifacts(artifactDir, before, { rangeStartSha: range.start, rangeEndSha: range.end, sessionId, now: now() })
            .map((r) => ({ ...r, relPath: join(`${range.start}_${range.end}`, r.relPath) }));
          for (const row of rows) artifacts.create(row);
        }
        return full;
      } finally {
        done();
      }
    },
    listArtifacts(range?: ChatRange): ArtifactRow[] {
      return range ? artifacts.listByRange(range.start, range.end) : artifacts.listAll();
    },
    async runAiReview(range: ChatRange, opts: AiReviewOptions): Promise<AiReviewRow> {
      const done = inflight.begin();
      // Track the run at the app level so the header can show it in progress
      // even after the popup that started it is closed.
      aiReviewTracker.start(range);
      try {
        await ensureClone();
        const [headDir, baseDir] = await Promise.all([git.ensureWorktree(range.end), git.ensureWorktree(range.start)]);
        const template = opts.templateId ? config.templates.find((t) => t.id === opts.templateId) ?? null : null;
        const prompt: string = buildReviewPrompt(template?.prompt ?? null, opts.prompt ?? null, range);
        let body = "";
        for await (const ev of ai.chat({
          prompt, model: opts.model, cwd: headDir, additionalDirectories: [baseDir],
          systemPrompt: `You are reviewing pull request ${pr.owner}/${pr.repo} #${pr.number}: "${pr.title}". The base checkout is at ${baseDir}.`,
        })) {
          // Collect the finalized reply text; `delta`/`activity` events are for live UIs.
          if (ev.kind === "text") body += ev.text;
        }
        const id: number = aiReviews.create({
          startSha: range.start, endSha: range.end, model: opts.model,
          template: opts.templateId ?? null, prompt: opts.prompt ?? null, body, createdAt: now(),
        });
        const row = aiReviews.get(id);
        if (!row) throw new Error("Failed to persist AI review.");
        aiReviewTracker.finish(range, id);
        return row;
      } catch (err) {
        aiReviewTracker.fail(range, err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        done();
      }
    },
    listAiReviews(range?: ChatRange): AiReviewRow[] {
      return range ? aiReviews.listByRange(range.start, range.end) : aiReviews.listAll();
    },
    aiReviewStatuses(): AiReviewStatus[] {
      return aiReviewTracker.list();
    },
    dismissAiReviewStatus(range: ChatRange): void {
      aiReviewTracker.dismiss(range);
    },
    resolveArtifact(relPath: string): string | null {
      const abs: string = join(artifactsBase, relPath);
      const base: string = artifactsBase.endsWith("/") ? artifactsBase : `${artifactsBase}/`;
      return abs.startsWith(base) ? abs : null;
    },
    async fileSplit(path: string, startSha: string, endSha: string, ignoreWhitespace?: boolean): Promise<SplitRow[]> {
      await ensureClone();
      const [raw, wordRaw] = await Promise.all([
        git.fullFileDiff(startSha, endSha, path, ignoreWhitespace),
        git.fullFileWordDiff(startSha, endSha, path, ignoreWhitespace),
      ]);
      const hunk = parseUnifiedDiff(raw)[0]?.hunks[0];
      if (!hunk) return [];
      const fc = parseWordDiff(wordRaw)[0];
      return buildSplitRows(withWordChanges(hunk.lines, fc));
    },
  };
}
