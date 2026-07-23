import { describe, expect, test } from "bun:test";
import type { CommandResult, CommandRunner, RunOptions } from "@/services/exec.ts";
import {
  createGhSearchService, mergePrGroups, toMyPrs, buildSizesQuery, parseSizes, sizeKey,
  buildStatesQuery, parseStates,
  type MyPrSummary, type PrSizeRef,
} from "@/services/ghSearch.ts";

/** Build a `gh search prs` JSON item. */
function item(url: string, opts: Partial<{ title: string; login: string; isDraft: boolean; updatedAt: string; createdAt: string }> = {}): unknown {
  return {
    number: Number(url.split("/").pop()),
    title: opts.title ?? "some title",
    url,
    author: { login: opts.login ?? "ayush" },
    isDraft: opts.isDraft ?? false,
    updatedAt: opts.updatedAt ?? "2026-07-10T00:00:00Z",
    createdAt: opts.createdAt ?? "2026-07-01T00:00:00Z",
  };
}

const AUTHORED = "https://github.com/acme/api/pull/1";
const ASSIGNED = "https://github.com/acme/api/pull/2";
const SHARED = "https://github.com/acme/web/pull/9"; // authored AND review-requested

/**
 * A runner that returns a different canned result per relationship, keyed by
 * which `--<flag>=@me` argument the call carries.
 */
function relationRunner(byFlag: Record<string, unknown[]>): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    runner: {
      async run(_cmd: string, args: string[], _opts?: RunOptions): Promise<CommandResult> {
        calls.push(args);
        const flag = args.find((a) => a.endsWith("=@me")) ?? "";
        return { stdout: JSON.stringify(byFlag[flag] ?? []), stderr: "", exitCode: 0 };
      },
    },
  };
}

describe("toMyPrs", () => {
  test("maps a gh item, deriving owner/repo/number from the url", () => {
    const [pr] = toMyPrs(JSON.stringify([item(AUTHORED, { title: "fix bug", login: "octo", updatedAt: "2026-07-12T00:00:00Z", createdAt: "2026-07-02T00:00:00Z" })]), "authored");
    expect(pr).toEqual({
      owner: "acme", repo: "api", number: 1, title: "fix bug",
      url: AUTHORED, author: "octo", isDraft: false,
      updatedAtIso: "2026-07-12T00:00:00Z", createdAtIso: "2026-07-02T00:00:00Z", relationships: ["authored"],
    });
  });

  test("returns an empty list for an empty result", () => {
    expect(toMyPrs("[]", "assigned")).toEqual([]);
  });
});

describe("mergePrGroups", () => {
  test("dedupes by url, unions relationships in canonical order, newest first", () => {
    const authored: MyPrSummary[] = toMyPrs(JSON.stringify([
      item(SHARED, { updatedAt: "2026-07-15T00:00:00Z" }),
      item(AUTHORED, { updatedAt: "2026-07-01T00:00:00Z" }),
    ]), "authored");
    const reviewReq: MyPrSummary[] = toMyPrs(JSON.stringify([item(SHARED, { updatedAt: "2026-07-15T00:00:00Z" })]), "review-requested");
    const merged = mergePrGroups([authored, reviewReq]);
    expect(merged.map((p) => [p.url, p.relationships])).toEqual([
      [SHARED, ["authored", "review-requested"]],
      [AUTHORED, ["authored"]],
    ]);
  });
});

describe("createGhSearchService.listMyPrs", () => {
  test("runs three scoped searches and merges the results", async () => {
    const { runner, calls } = relationRunner({
      "--author=@me": [item(AUTHORED), item(SHARED)],
      "--assignee=@me": [item(ASSIGNED)],
      "--review-requested=@me": [item(SHARED)],
    });
    const prs = await createGhSearchService(runner).listMyPrs();
    expect(calls).toHaveLength(3);
    expect(calls[0]?.slice(0, 2)).toEqual(["search", "prs"]);
    expect(calls.every((a) => a.includes("--state=open"))).toBe(true);
    const byUrl = new Map(prs.map((p) => [p.url, p.relationships]));
    expect(byUrl.get(SHARED)).toEqual(["authored", "review-requested"]);
    expect(byUrl.get(ASSIGNED)).toEqual(["assigned"]);
    expect(byUrl.get(AUTHORED)).toEqual(["authored"]);
  });

  test("throws when a search call fails", async () => {
    const runner: CommandRunner = {
      async run(): Promise<CommandResult> {
        return { stdout: "", stderr: "gh: not authenticated", exitCode: 1 };
      },
    };
    await expect(createGhSearchService(runner).listMyPrs()).rejects.toThrow();
  });
});

const REFS: PrSizeRef[] = [
  { owner: "acme", repo: "api", number: 1 },
  { owner: "acme", repo: "web", number: 9 },
];

describe("buildSizesQuery / parseSizes", () => {
  test("builds one aliased repository lookup per ref", () => {
    const q = buildSizesQuery(REFS);
    expect(q).toContain('p0: repository(owner: "acme", name: "api")');
    expect(q).toContain("pullRequest(number: 1)");
    expect(q).toContain('p1: repository(owner: "acme", name: "web")');
    expect(q).toContain("pullRequest(number: 9)");
    expect(q).toContain("additions");
    expect(q).toContain("deletions");
    expect(q).toContain("changedFiles");
  });

  test("maps each alias back to its ref key", () => {
    const raw = JSON.stringify({
      data: {
        p0: { pullRequest: { additions: 120, deletions: 8, changedFiles: 5 } },
        p1: { pullRequest: { additions: 3, deletions: 3, changedFiles: 1 } },
      },
    });
    expect(parseSizes(raw, REFS)).toEqual({
      "acme/api/1": { additions: 120, deletions: 8, changedFiles: 5 },
      "acme/web/9": { additions: 3, deletions: 3, changedFiles: 1 },
    });
  });

  test("omits refs whose lookup came back null (e.g. no access)", () => {
    const raw = JSON.stringify({ data: { p0: { pullRequest: { additions: 1, deletions: 0, changedFiles: 1 } }, p1: null } });
    expect(parseSizes(raw, REFS)).toEqual({ "acme/api/1": { additions: 1, deletions: 0, changedFiles: 1 } });
  });

  test("sizeKey is owner/repo/number", () => {
    expect(sizeKey(REFS[0]!)).toBe("acme/api/1");
  });
});

describe("buildStatesQuery / parseStates", () => {
  test("builds one aliased state lookup per ref", () => {
    const q = buildStatesQuery(REFS);
    expect(q).toContain('p0: repository(owner: "acme", name: "api")');
    expect(q).toContain("pullRequest(number: 1) { state }");
    expect(q).toContain('p1: repository(owner: "acme", name: "web")');
    expect(q).toContain("pullRequest(number: 9) { state }");
  });

  test("maps each alias back to its ref key, normalizing the state", () => {
    const raw = JSON.stringify({
      data: { p0: { pullRequest: { state: "MERGED" } }, p1: { pullRequest: { state: "OPEN" } } },
    });
    expect(parseStates(raw, REFS)).toEqual({ "acme/api/1": "merged", "acme/web/9": "open" });
  });

  test("omits refs whose lookup came back null (e.g. no access)", () => {
    const raw = JSON.stringify({ data: { p0: { pullRequest: { state: "CLOSED" } }, p1: null } });
    expect(parseStates(raw, REFS)).toEqual({ "acme/api/1": "closed" });
  });
});

describe("createGhSearchService.prStates", () => {
  test("runs a graphql query and returns states keyed by ref", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = {
      async run(_cmd, args): Promise<CommandResult> {
        calls.push(args);
        return { stdout: JSON.stringify({ data: { p0: { pullRequest: { state: "MERGED" } } } }), stderr: "", exitCode: 0 };
      },
    };
    const states = await createGhSearchService(runner).prStates([REFS[0]!]);
    expect(calls[0]?.slice(0, 2)).toEqual(["api", "graphql"]);
    expect(states).toEqual({ "acme/api/1": "merged" });
  });

  test("returns an empty map for no refs without calling gh", async () => {
    let called = false;
    const runner: CommandRunner = {
      async run(): Promise<CommandResult> { called = true; return { stdout: "", stderr: "", exitCode: 0 }; },
    };
    expect(await createGhSearchService(runner).prStates([])).toEqual({});
    expect(called).toBe(false);
  });
});

describe("createGhSearchService.prSizes", () => {
  test("runs a graphql query and returns sizes keyed by ref", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = {
      async run(_cmd, args): Promise<CommandResult> {
        calls.push(args);
        return { stdout: JSON.stringify({ data: { p0: { pullRequest: { additions: 10, deletions: 2, changedFiles: 3 } } } }), stderr: "", exitCode: 0 };
      },
    };
    const sizes = await createGhSearchService(runner).prSizes([REFS[0]!]);
    expect(calls[0]?.slice(0, 2)).toEqual(["api", "graphql"]);
    expect(sizes).toEqual({ "acme/api/1": { additions: 10, deletions: 2, changedFiles: 3 } });
  });

  test("returns an empty map for no refs without calling gh", async () => {
    let called = false;
    const runner: CommandRunner = {
      async run(): Promise<CommandResult> { called = true; return { stdout: "", stderr: "", exitCode: 0 }; },
    };
    expect(await createGhSearchService(runner).prSizes([])).toEqual({});
    expect(called).toBe(false);
  });
});
