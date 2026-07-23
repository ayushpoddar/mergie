import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { startDaemon, type DaemonHandle } from "@/daemon/server.ts";
import type { AppRouter } from "@/daemon/router.ts";
import type { LoadedPr, PrRegistry } from "@/daemon/registry.ts";
import type { GhSearchService, MyPrSummary } from "@/services/ghSearch.ts";

const MY_PR: MyPrSummary = {
  owner: "o", repo: "r", number: 7, title: "mine", url: "https://github.com/o/r/pull/7",
  author: "ayush", isDraft: false, updatedAtIso: "2026-07-15T00:00:00Z", createdAtIso: "2026-07-01T00:00:00Z", relationships: ["authored"],
};

function fakeSearch(): GhSearchService {
  return { listMyPrs: async () => [MY_PR], prSizes: async () => ({}) };
}

function fakeRegistry(): PrRegistry {
  const loaded: LoadedPr[] = [];
  return {
    async loadPr(url) {
      const pr: LoadedPr = {
        id: `pr-${loaded.length + 1}`, url, owner: "o", repo: "r", number: 1, title: "T", body: "", baseRef: "main", headRef: "feature",
        commitCount: 0, additions: 0, deletions: 0, changedFiles: 0, createdAtIso: "", updatedAtIso: "", authorLogin: "", lastOpenedAtMs: 0,
      };
      loaded.push(pr);
      return pr;
    },
    listPrs: () => loaded,
    getPr: (id) => loaded.find((p) => p.id === id),
    touchPr: () => {},
    prProgress: async () => ({ viewed: 0, total: 0 }),
    commits: async () => [],
    getWorkspace: () => undefined,
    drainAi: async () => true,
  };
}

let daemon: DaemonHandle;
let client: ReturnType<typeof createTRPCClient<AppRouter>>;

beforeAll(async () => {
  daemon = await startDaemon({ port: 0, registry: fakeRegistry(), search: fakeSearch(), requestStop: () => {} });
  client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${daemon.url}/trpc` })] });
});

afterAll(() => daemon.stop());

describe("startDaemon", () => {
  test("serves the tRPC health query over HTTP", async () => {
    expect(await client.health.query()).toEqual({ ok: true, prs: [] });
  });

  test("serves loadPr and reflects it in listPrs", async () => {
    const pr = await client.loadPr.mutate({ url: "https://github.com/o/r/pull/1" });
    expect(pr.id).toBe("pr-1");
    expect(await client.listPrs.query()).toHaveLength(1);
  });

  test("serves listMyPrs from the search service", async () => {
    expect(await client.listMyPrs.query()).toEqual([MY_PR]);
  });

  test("exposes the bound port", () => {
    expect(daemon.port).toBeGreaterThan(0);
  });
});
