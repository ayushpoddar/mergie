import { beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "@/db/migrate.ts";
import { createPrRegistry } from "@/daemon/createRegistry.ts";
import { defaultConfig } from "@/domain/config.ts";
import type { GitService } from "@/services/git.ts";
import type { GhPrService, PrMeta } from "@/services/ghPr.ts";
import type { GithubComment, GithubService, PostCommentInput } from "@/services/github.ts";
import type { SymbolsService } from "@/services/symbols.ts";
import type { AiService } from "@/services/ai.ts";

const META: PrMeta = {
  title: "feat: add report export",
  body: "## Summary\n\nAdds an export endpoint.",
  baseRef: "staging",
  headRef: "feat/report-export-api",
  headSha: "c4cd0f6",
  additions: 120,
  deletions: 8,
  changedFiles: 5,
  createdAtIso: "2026-07-09T08:00:00Z",
  updatedAtIso: "2026-07-12T12:00:00Z",
  authorLogin: "ayushpoddar",
  commits: [
    { sha: "aaa111", subject: "add endpoint", authorName: "Ayush", isoDate: "2026-07-10T09:54:29Z" },
    { sha: "bbb222", subject: "fix test", authorName: "Ayush", isoDate: "2026-07-11T10:00:00Z" },
  ],
};

function fakeGhPr(): GhPrService & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() { return state.calls; },
    async fetchPr() { state.calls += 1; return META; },
  };
}

const URL = "https://github.com/withastro/astro/pull/17360/changes";

function makeRegistry(gh: GhPrService) {
  return createPrRegistry({
    ghPr: gh,
    openDb: () => openDatabase(":memory:"),
    ensureDir: () => {},
    pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
  });
}

let gh: ReturnType<typeof fakeGhPr>;

beforeEach(() => {
  gh = fakeGhPr();
});

describe("createPrRegistry", () => {
  test("loadPr parses the URL, fetches metadata, and returns a LoadedPr", async () => {
    const pr = await makeRegistry(gh).loadPr(URL);
    expect(pr).toMatchObject({
      id: "withastro_astro_17360",
      owner: "withastro",
      repo: "astro",
      number: 17360,
      title: "feat: add report export",
      body: "## Summary\n\nAdds an export endpoint.",
      baseRef: "staging",
      headRef: "feat/report-export-api",
    });
  });

  test("listPrs and getPr reflect loaded PRs", async () => {
    const reg = makeRegistry(gh);
    const pr = await reg.loadPr(URL);
    expect(reg.listPrs()).toHaveLength(1);
    expect(reg.getPr(pr.id)?.title).toBe("feat: add report export");
  });

  test("loading the same PR twice is deduped (metadata fetched once)", async () => {
    const reg = makeRegistry(gh);
    await reg.loadPr(URL);
    await reg.loadPr("https://github.com/withastro/astro/pull/17360");
    expect(reg.listPrs()).toHaveLength(1);
    expect(gh.calls).toBe(1);
  });

  test("commits maps PR metadata to CommitInfo", async () => {
    const reg = makeRegistry(gh);
    const pr = await reg.loadPr(URL);
    const commits = await reg.commits(pr.id);
    expect(commits.map((c) => c.sha)).toEqual(["aaa111", "bbb222"]);
    expect(commits[0]).toMatchObject({ shortSha: "aaa111", subject: "add endpoint", authorName: "Ayush" });
  });

  test("commits throws for an unknown PR id", async () => {
    await expect(makeRegistry(gh).commits("nope")).rejects.toThrow();
  });

  test("LoadedPr carries commit count, diff size, timestamps, and author", async () => {
    const pr = await makeRegistry(gh).loadPr(URL);
    expect(pr).toMatchObject({
      commitCount: 2,
      additions: 120,
      deletions: 8,
      changedFiles: 5,
      createdAtIso: "2026-07-09T08:00:00Z",
      updatedAtIso: "2026-07-12T12:00:00Z",
      authorLogin: "ayushpoddar",
    });
  });
});

const URL_A = "https://github.com/acme/api/pull/1";
const URL_B = "https://github.com/acme/api/pull/2";

/** A registry with a mutable clock so load/touch ordering is observable. */
function makeClockRegistry(clock: { t: number }) {
  return createPrRegistry({
    ghPr: fakeGhPr(),
    openDb: () => openDatabase(":memory:"),
    makeGit: fakeGit,
    config: defaultConfig(),
    ensureDir: () => {},
    now: () => clock.t,
    pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
  });
}

describe("recently-opened ordering", () => {
  test("listPrs is sorted most-recently-opened first", async () => {
    const clock = { t: 100 };
    const reg = makeClockRegistry(clock);
    await reg.loadPr(URL_A); // opened at 100
    clock.t = 200;
    await reg.loadPr(URL_B); // opened at 200
    expect(reg.listPrs().map((p) => p.number)).toEqual([2, 1]);
  });

  test("touchPr moves a PR to the front", async () => {
    const clock = { t: 100 };
    const reg = makeClockRegistry(clock);
    const a = await reg.loadPr(URL_A);
    clock.t = 200;
    await reg.loadPr(URL_B);
    clock.t = 300;
    reg.touchPr(a.id); // re-opening A
    expect(reg.listPrs().map((p) => p.number)).toEqual([1, 2]);
    expect(reg.getPr(a.id)?.lastOpenedAtMs).toBe(300);
  });

  test("touchPr on an unknown id is a no-op", () => {
    const reg = makeClockRegistry({ t: 1 });
    expect(() => reg.touchPr("nope")).not.toThrow();
  });
});

describe("whole-PR review progress", () => {
  test("reports total hunks and how many are viewed", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    expect(await reg.prProgress(pr.id)).toEqual({ viewed: 0, total: 1 });
    const files = await ws.rangeView("base0", "c4cd0f6");
    ws.setHunkViewed(files[0]!.hunks[0]!.hash, true);
    expect(await reg.prProgress(pr.id)).toEqual({ viewed: 1, total: 1 });
  });

  test("prProgress throws for an unknown PR id", async () => {
    await expect(makeReviewRegistry().prProgress("nope")).rejects.toThrow();
  });
});

const RANGE_DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;

const WT_DIR = "/tmp/mergie-test-data/wt";

function fakeGit(): GitService {
  return {
    cloneOrFetch: async () => {},
    listCommits: async () => [],
    mergeBase: async () => "base0",
    fileAtRef: async () => null,
    // Honour ignoreWhitespace so tests can assert the flag is threaded through:
    // a whitespace-only diff collapses to empty when the flag is set.
    rawDiff: async (_s, _e, _paths, ignoreWhitespace) => (ignoreWhitespace ? "" : RANGE_DIFF),
    rawWordDiff: async () => "",
    fullFileDiff: async (_s, _e, _path, ignoreWhitespace) => (ignoreWhitespace ? "" : RANGE_DIFF),
    fullFileWordDiff: async () => "",
    ensureWorktree: async (sha) => `${WT_DIR}/${sha}`,
  };
}

function makeReviewRegistry() {
  return createPrRegistry({
    ghPr: fakeGhPr(),
    openDb: () => openDatabase(":memory:"),
    makeGit: fakeGit,
    config: defaultConfig(),
    ensureDir: () => {},
    now: () => 1000,
    pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
  });
}

describe("clone remote", () => {
  /** Load a PR and return the remote URL passed to the lazy clone. */
  async function capturedCloneUrl(prUrl: string): Promise<string | null> {
    let url: string | null = null;
    const recordingGit = (): GitService => ({ ...fakeGit(), cloneOrFetch: async (u) => { url = u; } });
    const reg = createPrRegistry({
      ghPr: fakeGhPr(), openDb: () => openDatabase(":memory:"), makeGit: recordingGit,
      config: defaultConfig(), ensureDir: () => {}, now: () => 1000,
      pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
    });
    const pr = await reg.loadPr(prUrl);
    await reg.getWorkspace(pr.id)!.commitsWithBaseline(); // triggers the lazy clone
    return url;
  }

  test("clones over HTTPS (not SSH) for github.com", async () => {
    expect(await capturedCloneUrl("https://github.com/withastro/astro/pull/17360")).toBe(
      "https://github.com/withastro/astro.git",
    );
  });

  test("honours the PR host for GitHub Enterprise", async () => {
    expect(await capturedCloneUrl("https://github.acme.com/acme/widgets/pull/7")).toBe(
      "https://github.acme.com/acme/widgets.git",
    );
  });
});

describe("workspace refresh", () => {
  test("re-fetches metadata and surfaces new commits + updated title", async () => {
    let calls = 0;
    const gh: GhPrService = {
      async fetchPr() {
        calls += 1;
        if (calls === 1) return { ...META, title: "old title" };
        return {
          ...META,
          title: "new title",
          commits: [...META.commits, { sha: "ccc333", subject: "pushed later", authorName: "Ayush", isoDate: "2026-07-12T00:00:00Z" }],
        };
      },
    };
    const reg = createPrRegistry({
      ghPr: gh, openDb: () => openDatabase(":memory:"), makeGit: fakeGit,
      config: defaultConfig(), ensureDir: () => {}, now: () => 1000,
      pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
    });
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    expect(ws.commits().map((c) => c.sha)).toEqual(["aaa111", "bbb222"]);
    expect(ws.pr.title).toBe("old title");

    await ws.refresh();
    expect(ws.commits().map((c) => c.sha)).toEqual(["aaa111", "bbb222", "ccc333"]);
    expect(ws.pr.title).toBe("new title");
  });
});

describe("workspace review operations", () => {
  test("commitsWithBaseline returns the baseline and mapped commits", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const cwb = await reg.getWorkspace(pr.id)!.commitsWithBaseline();
    expect(cwb.baselineSha).toBe("base0");
    expect(cwb.commits.map((c) => c.sha)).toEqual(["aaa111", "bbb222"]);
  });

  test("defaultRange is baseline→head, then last-reviewed→head after a review", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    expect(await ws.defaultRange()).toEqual({ startSha: "base0", endSha: "bbb222" });
    ws.addReviewedRange("base0", "aaa111");
    expect(ws.listReviewedRanges()).toHaveLength(1);
    expect(await ws.defaultRange()).toEqual({ startSha: "aaa111", endSha: "bbb222" });
  });

  test("rangeView reflects hunk viewed state after setHunkViewed", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const before = await ws.rangeView("base0", "bbb222");
    const hash = before[0]!.hunks[0]!.hash;
    expect(before[0]!.hunks[0]!.viewed).toBe(false);
    ws.setHunkViewed(hash, true);
    const after = await ws.rangeView("base0", "bbb222");
    expect(after[0]!.hunks[0]!.viewed).toBe(true);
    expect(after[0]!.viewed).toBe(true);
  });

  test("a line comment is created, appears in rangeView, edits and deletes", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const id = ws.addComment({
      kind: "lines", side: "RIGHT", path: "src/a.ts", body: "why 3?",
      madeAtSha: "bbb222", lineText: "const b = 3;", lineNo: 1,
    });
    let files = await ws.rangeView("base0", "bbb222");
    expect(files[0]!.hunks[0]!.comments).toMatchObject([{ id, body: "why 3?", kind: "lines" }]);

    ws.editComment(id, "why not 4?");
    files = await ws.rangeView("base0", "bbb222");
    expect(files[0]!.hunks[0]!.comments[0]?.body).toBe("why not 4?");

    ws.deleteComment(id);
    files = await ws.rangeView("base0", "bbb222");
    expect(files[0]!.hunks[0]!.comments).toHaveLength(0);
  });

  test("rangeView passes ignoreWhitespace through to git (whitespace-only view collapses)", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    // Flag off → the diff is present; flag on → fakeGit returns empty, so no files.
    expect(await ws.rangeView("base0", "bbb222", false)).toHaveLength(1);
    expect(await ws.rangeView("base0", "bbb222", true)).toHaveLength(0);
  });

  test("fileSplit passes ignoreWhitespace through to git", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    expect(await ws.fileSplit("src/a.ts", "base0", "bbb222", false)).not.toHaveLength(0);
    expect(await ws.fileSplit("src/a.ts", "base0", "bbb222", true)).toHaveLength(0);
  });

  test("fileSplit returns aligned split rows for a file", async () => {
    const reg = makeReviewRegistry();
    const pr = await reg.loadPr(URL);
    const rows = await reg.getWorkspace(pr.id)!.fileSplit("src/a.ts", "base0", "bbb222");
    expect(rows[0]).toEqual({
      left: { no: 1, text: "const a = 1;", kind: "ctx" },
      right: { no: 1, text: "const a = 1;", kind: "ctx" },
    });
    expect(rows[1]).toMatchObject({ left: { kind: "del", text: "const b = 2;" }, right: { kind: "add", text: "const b = 3;" } });
  });
});

/** A GitHub service double capturing all outbound calls, seeded with inbound comments. */
function fakeGithub(seed: GithubComment[] = []) {
  const state = {
    posted: [] as PostCommentInput[],
    edited: [] as Array<[number, string]>,
    deleted: [] as number[],
    replied: [] as Array<[number, string]>,
    inbound: [...seed],
    viewer: "octocat",
    // When non-empty, viewer() consumes these in order (to script transient failures).
    viewerQueue: [] as string[],
    nextId: 5000,
  };
  const svc: GithubService = {
    async postComment(input) {
      state.posted.push(input);
      const id = state.nextId++;
      return { id, htmlUrl: `https://github.com/withastro/astro/pull/17360#discussion_r${id}` };
    },
    async editComment(id, body) { state.edited.push([id, body]); },
    async deleteComment(id) { state.deleted.push(id); },
    async replyToComment(inReplyToId, body) {
      state.replied.push([inReplyToId, body]);
      const id = state.nextId++;
      return { id, htmlUrl: `https://github.com/x#discussion_r${id}` };
    },
    async listReviewComments() { return state.inbound; },
    async viewer() { return state.viewerQueue.length > 0 ? (state.viewerQueue.shift() ?? "") : state.viewer; },
    buildThreads() { return []; },
  };
  return { svc, state };
}

/** A GitHub inline review comment as returned by the service. */
function seedComment(over: Partial<GithubComment>): GithubComment {
  return {
    id: 700, path: "src/a.ts", side: "RIGHT", line: 2, startLine: null,
    commitId: "bbb222", body: "why 3?", author: "octocat",
    createdAtIso: "2026-07-12T10:00:00Z", inReplyToId: null,
    diffHunk: "@@ -1,2 +1,2 @@", htmlUrl: "https://github.com/x#discussion_r700", ...over,
  };
}

function makeGithubRegistry(seed: GithubComment[] = []) {
  const gh = fakeGithub(seed);
  const reg = createPrRegistry({
    ghPr: fakeGhPr(),
    openDb: () => openDatabase(":memory:"),
    makeGit: fakeGit,
    makeGithub: () => gh.svc,
    config: defaultConfig(),
    ensureDir: () => {},
    now: () => 1000,
    pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
  });
  return { reg, gh };
}

/** Add a RIGHT line comment on the added line and return its id + workspace. */
async function withLineComment() {
  const { reg, gh } = makeGithubRegistry();
  const pr = await reg.loadPr(URL);
  const ws = reg.getWorkspace(pr.id)!;
  const id = ws.addComment({
    kind: "lines", side: "RIGHT", path: "src/a.ts", body: "why 3?",
    madeAtSha: "bbb222", lineText: "const b = 3;", lineNo: 1,
  });
  return { ws, id, gh };
}

describe("workspace github posting", () => {
  test("postComment posts a single-line comment to the range-end commit", async () => {
    const { ws, id, gh } = await withLineComment();
    const res = await ws.postComment(id, "end");
    expect(gh.state.posted).toHaveLength(1);
    expect(gh.state.posted[0]).toMatchObject({
      path: "src/a.ts", side: "RIGHT", line: 2, commitId: "bbb222", body: "why 3?",
    });
    expect(gh.state.posted[0]).not.toHaveProperty("startLine");
    const stored = ws.listComments().find((c) => c.id === id);
    expect(stored?.githubUrl).toBe(res.githubUrl);
    expect(stored?.githubId).toBe(String(gh.state.nextId - 1));
  });

  test("postComment to head anchors on the PR head commit", async () => {
    const { ws, id, gh } = await withLineComment();
    await ws.postComment(id, "head");
    expect(gh.state.posted[0]?.commitId).toBe("c4cd0f6");
  });

  test("postComment for a whole hunk posts a multi-line span of the changed lines", async () => {
    const { reg, gh } = makeGithubRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const files = await ws.rangeView("base0", "bbb222");
    const hash = files[0]!.hunks[0]!.hash;
    const id = ws.addComment({
      kind: "hunk", side: "RIGHT", path: "src/a.ts", body: "rework this", madeAtSha: "bbb222", hunkHash: hash,
    });
    await ws.postComment(id, "end");
    expect(gh.state.posted[0]).toMatchObject({ path: "src/a.ts", side: "RIGHT", line: 2, commitId: "bbb222" });
  });

  test("editing a posted comment propagates the edit to GitHub", async () => {
    const { ws, id, gh } = await withLineComment();
    await ws.postComment(id, "end");
    await ws.editComment(id, "why not 4?");
    expect(gh.state.edited).toEqual([[5000, "why not 4?"]]);
  });

  test("deleting a posted comment deletes it on GitHub too", async () => {
    const { ws, id, gh } = await withLineComment();
    await ws.postComment(id, "end");
    await ws.deleteComment(id);
    expect(gh.state.deleted).toEqual([5000]);
    expect(ws.listComments()).toHaveLength(0);
  });

  test("editing/deleting an unposted comment makes no GitHub calls", async () => {
    const { ws, id, gh } = await withLineComment();
    await ws.editComment(id, "changed");
    await ws.deleteComment(id);
    expect(gh.state.edited).toHaveLength(0);
    expect(gh.state.deleted).toHaveLength(0);
  });

  test("postCommentPreview warns when the line is absent at the target", async () => {
    const { reg } = makeGithubRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const id = ws.addComment({
      kind: "lines", side: "RIGHT", path: "src/a.ts", body: "gone",
      madeAtSha: "bbb222", lineText: "totally absent line", lineNo: 1,
    });
    const preview = await ws.postCommentPreview(id, "end");
    expect(preview.canPost).toBe(false);
    expect(preview.warning).toBeTruthy();
    await expect(ws.postComment(id, "end")).rejects.toThrow();
  });

  test("postCommentPreview resolves the line for a postable comment", async () => {
    const { ws, id } = await withLineComment();
    const preview = await ws.postCommentPreview(id, "end");
    expect(preview).toMatchObject({ canPost: true, commitId: "bbb222", side: "RIGHT", line: 2, startLine: null });
  });
});

describe("workspace github sync + reply", () => {
  test("syncGithub caches inbound comments; rangeView surfaces them as threads", async () => {
    const { reg } = makeGithubRegistry([
      seedComment({ id: 700, line: 2, body: "why 3?" }),
      seedComment({ id: 701, inReplyToId: 700, body: "good point", createdAtIso: "2026-07-12T11:00:00Z" }),
    ]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const count = await ws.syncGithub();
    expect(count).toBe(2);
    const files = await ws.rangeView("base0", "bbb222");
    const threads = files[0]!.hunks[0]!.githubThreads;
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ lineIndex: 2, root: { body: "why 3?" } });
    expect(threads[0]!.replies.map((r) => r.body)).toEqual(["good point"]);
    expect(threads[0]!.root.htmlUrl).toContain("discussion_r700");
  });

  test("syncGithub reconciles posted comments: GitHub edit wins, GitHub delete removes locally", async () => {
    const { ws, id, gh } = await withLineComment();
    const res = await ws.postComment(id, "end");
    const ghId = Number(res.githubId);
    // Edited on GitHub → next fetch updates the stored body (GitHub is source of truth).
    gh.state.inbound = [seedComment({ id: ghId, body: "edited on github", author: "octocat", path: "src/a.ts", line: 2 })];
    await ws.syncGithub();
    expect(ws.listComments().find((c) => c.id === id)?.body).toBe("edited on github");
    // Deleted on GitHub → next fetch removes it locally; it must not resurrect.
    gh.state.inbound = [];
    await ws.syncGithub();
    expect(ws.listComments().find((c) => c.id === id)).toBeUndefined();
    expect((await ws.listAllComments()).some((e) => e.localId === id)).toBe(false);
  });

  test("a transient viewer-login failure is not cached: mine-classification recovers next call", async () => {
    const { reg, gh } = makeGithubRegistry([seedComment({ id: 900, body: "mine on gh", author: "octocat" })]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    await ws.syncGithub();
    gh.state.viewerQueue = ["", "octocat"]; // first lookup fails, second succeeds
    const first = await ws.listAllComments();
    expect(first.find((e) => e.body === "mine on gh")!.mine).toBe(false); // failed lookup → not mine
    const second = await ws.listAllComments();
    expect(second.find((e) => e.body === "mine on gh")!.mine).toBe(true); // recovered, now mine
  });

  test("a posted comment present on GitHub shows exactly once (deduped by github id)", async () => {
    const { ws, id, gh } = await withLineComment();
    const res = await ws.postComment(id, "end");
    gh.state.inbound = [seedComment({ id: Number(res.githubId), body: "why 3?", author: "octocat", path: "src/a.ts", line: 2 })];
    await ws.syncGithub();
    const entries = await ws.listAllComments();
    const forThis = entries.filter((e) => e.body === "why 3?");
    expect(forThis).toHaveLength(1);
    expect(forThis[0]).toMatchObject({ origin: "posted", localId: id });
  });

  test("replyToThread posts a reply on GitHub and refreshes the cache", async () => {
    const { reg, gh } = makeGithubRegistry([seedComment({ id: 700 })]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    await ws.syncGithub();
    await ws.replyToThread("700", "thanks!");
    expect(gh.state.replied).toEqual([[700, "thanks!"]]);
  });

  test("editGithubComment edits my own fetched GitHub comment on GitHub and in the cache", async () => {
    const { reg, gh } = makeGithubRegistry([seedComment({ id: 900, author: "octocat", body: "old" })]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    await ws.syncGithub();
    await ws.editGithubComment("900", "updated");
    expect(gh.state.edited).toEqual([[900, "updated"]]);
    expect((await ws.listAllComments()).find((e) => e.githubId === "900")?.body).toBe("updated");
  });

  test("deleteGithubComment deletes my own fetched GitHub comment and drops it from the list", async () => {
    const { reg, gh } = makeGithubRegistry([seedComment({ id: 901, author: "octocat" })]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    await ws.syncGithub();
    await ws.deleteGithubComment("901");
    expect(gh.state.deleted).toEqual([901]);
    expect((await ws.listAllComments()).some((e) => e.githubId === "901")).toBe(false);
  });

  test("deleting a posted comment whose thread is cached drops it immediately (no phantom until next fetch)", async () => {
    const { ws, id, gh } = await withLineComment();
    const res = await ws.postComment(id, "end");
    // Simulate a prior fetch that cached the posted comment as a GitHub thread.
    gh.state.inbound = [seedComment({ id: Number(res.githubId), body: "why 3?", author: "octocat", path: "src/a.ts", line: 2 })];
    await ws.syncGithub();
    expect(await ws.listAllComments()).toHaveLength(1);

    await ws.deleteComment(id);
    // It must be gone right away — not linger as a "from GitHub" phantom.
    expect(await ws.listAllComments()).toHaveLength(0);
  });

  test("editing a posted comment updates the cached thread body too (no stale copy)", async () => {
    const { ws, id, gh } = await withLineComment();
    const res = await ws.postComment(id, "end");
    gh.state.inbound = [seedComment({ id: Number(res.githubId), body: "why 3?", author: "octocat", path: "src/a.ts", line: 2 })];
    await ws.syncGithub();

    await ws.editComment(id, "why not 4?");
    const entries = await ws.listAllComments();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.body).toBe("why not 4?");
  });

  test("edit/delete of another user's GitHub comment is refused and makes no GitHub calls", async () => {
    const { reg, gh } = makeGithubRegistry([seedComment({ id: 902, author: "alice" })]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    await ws.syncGithub();
    await expect(ws.editGithubComment("902", "hax")).rejects.toThrow();
    await expect(ws.deleteGithubComment("902")).rejects.toThrow();
    expect(gh.state.edited).toHaveLength(0);
    expect(gh.state.deleted).toHaveLength(0);
  });

  test("listAllComments merges local + fetched GitHub comments, classified and deduped", async () => {
    const { reg, gh } = makeGithubRegistry([
      seedComment({ id: 800, body: "others say", author: "alice" }),   // others' GitHub comment
      seedComment({ id: 801, body: "my gh note", author: "octocat" }), // my GitHub-authored comment
    ]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    // A local-only comment authored in mergie.
    ws.addComment({ kind: "lines", side: "RIGHT", path: "src/a.ts", body: "local note", madeAtSha: "bbb222", lineText: "const b = 3;", lineNo: 1 });
    await ws.syncGithub();

    const entries = await ws.listAllComments();
    const byOrigin = (o: string) => entries.filter((e) => e.origin === o);
    expect(entries).toHaveLength(3);
    expect(byOrigin("local")).toHaveLength(1);
    const github = byOrigin("github");
    expect(github).toHaveLength(2);
    expect(github.find((e) => e.body === "others say")!.mine).toBe(false);
    expect(github.find((e) => e.body === "my gh note")!.mine).toBe(true);
    expect(gh.state.viewer).toBe("octocat");
  });
});

/** A recorded symbol-service call, capturing the arg matrix the workspace passes. */
interface RecordedSymbolCall {
  /** Which method was invoked. */
  op: "definition" | "usages" | "search";
  /** The symbol/word argument. */
  arg: string;
  /** The checkout directory. */
  cwd: string;
  /** The `--file` scope, if any (definition/usages). */
  file: string | undefined;
  /** The search flags, if any (search). */
  regex?: boolean;
  /** Case sensitivity flag (search). */
  caseSensitive?: boolean;
}

/** A symbols-service double recording its calls. */
function fakeSymbols() {
  const calls: RecordedSymbolCall[] = [];
  const base: { before: string[]; after: string[]; testOrGenerated: boolean } = { before: [], after: [], testOrGenerated: false };
  const svc: SymbolsService = {
    async definition(symbol, opts) {
      calls.push({ op: "definition", arg: symbol, cwd: opts.cwd, file: opts.file });
      return [{ ...base, path: "src/a.ts", line: 1, matched: "function a() {}", body: "function a() {}", scope: "a", kind: "definition" }];
    },
    async usages(symbol, opts) {
      calls.push({ op: "usages", arg: symbol, cwd: opts.cwd, file: opts.file });
      // Exercise the readFile bridge: the workspace binds it to git.fileAtRef(sha).
      await opts.readFile("src/b.ts");
      return [{ ...base, path: `${opts.cwd}/src/b.ts`, line: 9, matched: "a();", scope: "Svc", kind: "usage" }];
    },
    async search(word, opts) {
      calls.push({ op: "search", arg: word, cwd: opts.cwd, file: undefined, regex: opts.regex, caseSensitive: opts.caseSensitive });
      return [{ ...base, path: `${opts.cwd}/src/c.ts`, line: 5, matched: "x", kind: "search" }];
    },
  };
  return { svc, calls };
}

function makeSymbolRegistry() {
  const sym = fakeSymbols();
  const reg = createPrRegistry({
    ghPr: fakeGhPr(),
    openDb: () => openDatabase(":memory:"),
    makeGit: () => ({ ...fakeGit(), fileAtRef: async (sha, path) => `// ${path}@${sha}` }),
    makeSymbols: () => sym.svc,
    config: defaultConfig(),
    ensureDir: () => {},
    now: () => 1000,
    pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
  });
  return { reg, sym };
}

describe("workspace symbol navigation", () => {
  test("symbolDefinition runs sem in the worktree for the given sha", async () => {
    const { reg, sym } = makeSymbolRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const hits = await ws.symbolDefinition("myFn", "bbb222");
    expect(sym.calls[0]).toMatchObject({ op: "definition", arg: "myFn", cwd: `${WT_DIR}/bbb222`, file: undefined });
    expect(hits[0]).toMatchObject({ path: "src/a.ts", kind: "definition", body: "function a() {}" });
  });

  test("symbolDefinition forwards an optional file scope", async () => {
    const { reg, sym } = makeSymbolRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    await ws.symbolDefinition("myFn", "bbb222", "src/a.ts");
    expect(sym.calls[0]?.file).toBe("src/a.ts");
  });

  test("symbolUsages normalises worktree-absolute paths to repo-relative", async () => {
    const { reg, sym } = makeSymbolRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const hits = await ws.symbolUsages("myFn", "bbb222", "src/a.ts");
    expect(sym.calls[0]).toMatchObject({ op: "usages", file: "src/a.ts" });
    expect(hits[0]?.path).toBe("src/b.ts");
    expect(hits[0]?.kind).toBe("usage");
  });

  test("symbolSearch runs rg in the worktree, forwards flags, normalises paths", async () => {
    const { reg, sym } = makeSymbolRegistry();
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const hits = await ws.symbolSearch("needle", "base0", { regex: true, caseSensitive: true });
    expect(sym.calls[0]).toMatchObject({ op: "search", arg: "needle", cwd: `${WT_DIR}/base0`, regex: true, caseSensitive: true });
    expect(hits[0]?.path).toBe("src/c.ts");
  });
});

/**
 * An AI-service double that streams canned chunks as live `delta`s, then a
 * single finalized `text` block (the authoritative reply), recording the prompt.
 */
function fakeAi(chunks: string[]) {
  const seen: Array<{ prompt: string; model: string; cwd: string }> = [];
  const svc: AiService = {
    async *chat(opts) {
      seen.push({ prompt: opts.prompt, model: opts.model, cwd: opts.cwd });
      for (const c of chunks) yield { kind: "delta", text: c };
      yield { kind: "text", text: chunks.join("") };
    },
  };
  return { svc, seen };
}

function makeChatRegistry(chunks: string[]) {
  const ai = fakeAi(chunks);
  const reg = createPrRegistry({
    ghPr: fakeGhPr(),
    openDb: () => openDatabase(":memory:"),
    makeGit: fakeGit,
    makeAi: () => ai.svc,
    config: defaultConfig(),
    ensureDir: () => {},
    now: () => 1000,
    pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
  });
  return { reg, ai };
}

describe("workspace AI chat", () => {
  test("createChatSession + listChatSessions scoped to a hunk", async () => {
    const { reg } = makeChatRegistry([]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const id = ws.createChatSession("hunk", "hunkhash1", "claude-opus-4-8");
    expect(ws.listChatSessions("hunk", "hunkhash1").map((s) => s.id)).toEqual([id]);
    expect(ws.listChatSessions("hunk", "other")).toHaveLength(0);
  });

  test("streamChat persists both messages, streams chunks, and returns the reply", async () => {
    const { reg, ai } = makeChatRegistry(["Hel", "lo"]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const id = ws.createChatSession("file", "src/a.ts", "claude-sonnet-4-6");
    const got: string[] = [];
    const reply = await ws.streamChat(id, "what changed?", (ev) => got.push(ev.text));
    expect(got).toEqual(["Hel", "lo"]);
    expect(reply).toBe("Hello");
    const msgs = ws.listChatMessages(id);
    expect(msgs.map((m) => [m.role, m.content])).toEqual([["user", "what changed?"], ["assistant", "Hello"]]);
    expect(ai.seen[0]?.model).toBe("claude-sonnet-4-6");
    expect(ai.seen[0]?.prompt).toBe("what changed?");
  });

  test("second turn sends a labelled transcript to the agent", async () => {
    const { reg, ai } = makeChatRegistry(["ok"]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const id = ws.createChatSession("file", "src/a.ts", "claude-opus-4-8");
    await ws.streamChat(id, "first", () => {});
    await ws.streamChat(id, "second", () => {});
    expect(ai.seen[1]?.prompt).toBe("User: first\n\nAssistant: ok\n\nUser: second");
  });

  test("drainAi resolves false while an AI turn is in flight, true once it finishes", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((r) => { release = r; });
    const ai: AiService = { async *chat() { await gate; yield { kind: "text", text: "done" }; } };
    const reg = createPrRegistry({
      ghPr: fakeGhPr(), openDb: () => openDatabase(":memory:"), makeGit: fakeGit,
      makeAi: () => ai, config: defaultConfig(), ensureDir: () => {}, now: () => 1000,
      pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
    });
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const id = ws.createChatSession("file", "src/a.ts", "claude-opus-4-8");
    const turn = ws.streamChat(id, "hi", () => {});
    expect(await reg.drainAi(20)).toBe(false); // still running
    release();
    await turn;
    expect(await reg.drainAi(20)).toBe(true); // idle
  });

  test("runAiReview persists the result linked to the range and lists it", async () => {
    const { reg, ai } = makeChatRegistry(["Looks ", "good."]);
    const pr = await reg.loadPr(URL);
    const ws = reg.getWorkspace(pr.id)!;
    const review = await ws.runAiReview({ start: "base0", end: "bbb222" }, { model: "claude-opus-4-8", templateId: "adversarial", prompt: "focus on auth" });
    expect(review).toMatchObject({ startSha: "base0", endSha: "bbb222", model: "claude-opus-4-8", template: "adversarial", prompt: "focus on auth", body: "Looks good." });
    // The template + user prompt reached the agent.
    expect(ai.seen[0]?.prompt).toContain("focus on auth");
    expect(ai.seen[0]?.prompt).toContain("adversarial pass");
    expect(ws.listAiReviews({ start: "base0", end: "bbb222" })).toHaveLength(1);
    expect(ws.listAiReviews({ start: "x", end: "y" })).toHaveLength(0);
  });
});

describe("workspace fileAt", () => {
  test("returns file content at a commit", async () => {
    const reg = createPrRegistry({
      ghPr: fakeGhPr(),
      openDb: () => openDatabase(":memory:"),
      makeGit: () => ({ ...fakeGit(), fileAtRef: async (sha, path) => `// ${path}@${sha}\nline` }),
      config: defaultConfig(),
      ensureDir: () => {},
      now: () => 1000,
      pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
    });
    const pr = await reg.loadPr(URL);
    const content = await reg.getWorkspace(pr.id)!.fileAt("bbb222", "src/a.ts");
    expect(content).toBe("// src/a.ts@bbb222\nline");
  });
});
