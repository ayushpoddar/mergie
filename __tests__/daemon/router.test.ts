import { beforeEach, describe, expect, test } from "bun:test";
import { appRouter } from "@/daemon/router.ts";
import { createPrRegistry } from "@/daemon/createRegistry.ts";
import { openDatabase } from "@/db/migrate.ts";
import { defaultConfig } from "@/domain/config.ts";
import type { Context } from "@/daemon/trpc.ts";
import type { LoadedPr, PrRegistry } from "@/daemon/registry.ts";
import type { CommitInfo, GitService } from "@/services/git.ts";
import type { GhPrService, PrMeta } from "@/services/ghPr.ts";
import type { GhSearchService } from "@/services/ghSearch.ts";

/** A search service that returns no PRs (the router tests don't exercise it). */
const emptySearch: GhSearchService = { listMyPrs: async () => [], prSizes: async () => ({}) };

/** The metadata-derived LoadedPr fields the router tests don't care about. */
const PR_EXTRA = {
  commitCount: 0, additions: 0, deletions: 0, changedFiles: 0,
  createdAtIso: "", updatedAtIso: "", authorLogin: "", lastOpenedAtMs: 0,
} as const;

const COMMIT: CommitInfo = {
  sha: "abc123",
  shortSha: "abc123",
  subject: "do thing",
  authorName: "A",
  authorEmail: "a@x.com",
  isoDate: "2026-01-01T00:00:00+00:00",
};

function fakeRegistry(): PrRegistry & { loaded: LoadedPr[] } {
  const loaded: LoadedPr[] = [];
  return {
    loaded,
    async loadPr(url) {
      const pr: LoadedPr = {
        id: `pr-${loaded.length + 1}`, url, owner: "o", repo: "r",
        number: loaded.length + 1, title: "T", body: "", baseRef: "main", headRef: "feature",
        ...PR_EXTRA,
      };
      loaded.push(pr);
      return pr;
    },
    listPrs: () => loaded,
    getPr: (id) => loaded.find((p) => p.id === id),
    touchPr: () => {},
    prProgress: async () => ({ viewed: 0, total: 0 }),
    commits: async () => [COMMIT],
    getWorkspace: () => undefined,
    drainAi: async () => true,
  };
}

let ctx: Context;
let stopped: boolean;

beforeEach(() => {
  stopped = false;
  ctx = { registry: fakeRegistry(), search: emptySearch, requestStop: () => { stopped = true; } };
});

describe("appRouter", () => {
  test("health reports ok and current PRs", async () => {
    const caller = appRouter.createCaller(ctx);
    expect(await caller.health()).toEqual({ ok: true, prs: [] });
  });

  test("loadPr loads a PR and listPrs reflects it", async () => {
    const caller = appRouter.createCaller(ctx);
    const pr = await caller.loadPr({ url: "https://github.com/o/r/pull/5" });
    expect(pr).toMatchObject({ id: "pr-1", url: "https://github.com/o/r/pull/5" });
    expect(await caller.listPrs()).toHaveLength(1);
  });

  test("loadPr rejects an empty url", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.loadPr({ url: "" })).rejects.toThrow();
  });

  test("prCommits returns the PR's commits", async () => {
    const caller = appRouter.createCaller(ctx);
    await caller.loadPr({ url: "https://github.com/o/r/pull/5" });
    expect(await caller.prCommits({ id: "pr-1" })).toEqual([COMMIT]);
  });

  test("stop requests daemon shutdown", async () => {
    const caller = appRouter.createCaller(ctx);
    expect(await caller.stop()).toEqual({ stopping: true });
    expect(stopped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ignoreWhitespace forwarding — exercises the real registry/workspace so the
// router's optional input truly reaches git (a flag-honouring fake git returns
// an empty diff when whitespace is ignored, collapsing the view).
// ---------------------------------------------------------------------------

const WS_DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;

const WS_META: PrMeta = {
  title: "T", body: "", baseRef: "main", headRef: "feature", headSha: "bbb222",
  additions: 0, deletions: 0, changedFiles: 0, createdAtIso: "", updatedAtIso: "", authorLogin: "",
  commits: [
    { sha: "aaa111", subject: "one", authorName: "A", isoDate: "2026-07-10T00:00:00Z" },
    { sha: "bbb222", subject: "two", authorName: "A", isoDate: "2026-07-11T00:00:00Z" },
  ],
};

/** Git fake whose diffs collapse to empty when whitespace is ignored. */
function flagGit(): GitService {
  return {
    cloneOrFetch: async () => {},
    listCommits: async () => [],
    mergeBase: async () => "base0",
    fileAtRef: async () => null,
    rawDiff: async (_s, _e, _paths, ignoreWhitespace) => (ignoreWhitespace ? "" : WS_DIFF),
    rawWordDiff: async () => "",
    fullFileDiff: async (_s, _e, _path, ignoreWhitespace) => (ignoreWhitespace ? "" : WS_DIFF),
    fullFileWordDiff: async () => "",
    ensureWorktree: async (sha) => `/tmp/wt/${sha}`,
  };
}

describe("appRouter — ignoreWhitespace", () => {
  function realCtx(): Context {
    const registry = createPrRegistry({
      ghPr: { async fetchPr(): Promise<PrMeta> { return WS_META; } } satisfies GhPrService,
      openDb: () => openDatabase(":memory:"),
      makeGit: flagGit,
      config: defaultConfig(),
      ensureDir: () => {},
      now: () => 1000,
      pathEnv: { env: { XDG_DATA_HOME: "/tmp/mergie-test-data" }, home: "/tmp" },
    });
    return { registry, search: emptySearch, requestStop: () => {} };
  }

  test("rangeView forwards ignoreWhitespace to git", async () => {
    const caller = appRouter.createCaller(realCtx());
    const pr = await caller.loadPr({ url: "https://github.com/o/r/pull/5" });
    expect(await caller.rangeView({ id: pr.id, start: "base0", end: "bbb222" })).toHaveLength(1);
    expect(await caller.rangeView({ id: pr.id, start: "base0", end: "bbb222", ignoreWhitespace: true })).toHaveLength(0);
  });

  test("fileSplit forwards ignoreWhitespace to git", async () => {
    const caller = appRouter.createCaller(realCtx());
    const pr = await caller.loadPr({ url: "https://github.com/o/r/pull/5" });
    const shown = await caller.fileSplit({ id: pr.id, path: "src/a.ts", start: "base0", end: "bbb222" });
    expect(shown.length).toBeGreaterThan(0);
    expect(await caller.fileSplit({ id: pr.id, path: "src/a.ts", start: "base0", end: "bbb222", ignoreWhitespace: true })).toHaveLength(0);
  });
});
