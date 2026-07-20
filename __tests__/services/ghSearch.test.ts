import { describe, expect, test } from "bun:test";
import type { CommandResult, CommandRunner, RunOptions } from "@/services/exec.ts";
import {
  createGhSearchService, mergePrGroups, toMyPrs, type MyPrSummary,
} from "@/services/ghSearch.ts";

/** Build a `gh search prs` JSON item. */
function item(url: string, opts: Partial<{ title: string; login: string; isDraft: boolean; updatedAt: string }> = {}): unknown {
  return {
    number: Number(url.split("/").pop()),
    title: opts.title ?? "some title",
    url,
    author: { login: opts.login ?? "ayush" },
    isDraft: opts.isDraft ?? false,
    updatedAt: opts.updatedAt ?? "2026-07-10T00:00:00Z",
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
    const [pr] = toMyPrs(JSON.stringify([item(AUTHORED, { title: "fix bug", login: "octo", updatedAt: "2026-07-12T00:00:00Z" })]), "authored");
    expect(pr).toEqual({
      owner: "acme", repo: "api", number: 1, title: "fix bug",
      url: AUTHORED, author: "octo", isDraft: false,
      updatedAtIso: "2026-07-12T00:00:00Z", relationships: ["authored"],
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
