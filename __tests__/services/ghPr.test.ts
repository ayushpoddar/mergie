import { describe, expect, test } from "bun:test";
import type { CommandResult, CommandRunner, RunOptions } from "@/services/exec.ts";
import { createGhPrService, normalizeBody, type PrState } from "@/services/ghPr.ts";

/** Canned `gh pr view` JSON matching the real shape. */
const GH_JSON = JSON.stringify({
  title: "feat: add report export",
  body: "## Summary\r\n\r\nAdds an export endpoint.\r\n",
  baseRefName: "staging",
  headRefName: "feat/report-export-api",
  headRefOid: "c4cd0f6",
  additions: 120,
  deletions: 8,
  changedFiles: 5,
  createdAt: "2026-07-09T08:00:00Z",
  updatedAt: "2026-07-12T12:00:00Z",
  author: { login: "ayushpoddar" },
  state: "MERGED",
  commits: [
    {
      oid: "aaa111",
      messageHeadline: "add endpoint",
      committedDate: "2026-07-10T09:54:29Z",
      authors: [{ name: "Ayush Poddar", email: "a@x.com" }],
    },
    {
      oid: "bbb222",
      messageHeadline: "fix test",
      committedDate: "2026-07-11T10:00:00Z",
      authors: [{ name: "Ayush Poddar", email: "a@x.com" }],
    },
  ],
});

/** Recording fake runner. */
function fakeRunner(result: CommandResult): { runner: CommandRunner; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  return {
    calls,
    runner: {
      async run(cmd: string, args: string[], _opts?: RunOptions): Promise<CommandResult> {
        calls.push({ cmd, args });
        return result;
      },
    },
  };
}

const REF = { owner: "withastro", repo: "astro", number: 17360 } as const;

describe("ghPr.fetchPr", () => {
  test("invokes gh pr view with the right args", async () => {
    const { runner, calls } = fakeRunner({ stdout: GH_JSON, stderr: "", exitCode: 0 });
    await createGhPrService(runner).fetchPr(REF);
    expect(calls[0]?.cmd).toBe("gh");
    expect(calls[0]?.args).toEqual([
      "pr", "view", "17360", "--repo", "withastro/astro",
      "--json", "title,body,baseRefName,headRefName,headRefOid,commits,additions,deletions,changedFiles,createdAt,updatedAt,author,state",
    ]);
  });

  test("parses PR metadata and commits", async () => {
    const { runner } = fakeRunner({ stdout: GH_JSON, stderr: "", exitCode: 0 });
    const meta = await createGhPrService(runner).fetchPr(REF);
    expect(meta).toEqual({
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
      state: "merged",
      commits: [
        { sha: "aaa111", subject: "add endpoint", authorName: "Ayush Poddar", isoDate: "2026-07-10T09:54:29Z" },
        { sha: "bbb222", subject: "fix test", authorName: "Ayush Poddar", isoDate: "2026-07-11T10:00:00Z" },
      ],
    });
  });

  const stateCases: Array<[string, string, PrState]> = [
    ["normalizes OPEN", "OPEN", "open"],
    ["normalizes CLOSED", "CLOSED", "closed"],
    ["normalizes MERGED", "MERGED", "merged"],
    ["defaults an unknown state to open", "SOMETHING_ELSE", "open"],
    ["defaults a missing state to open", "", "open"],
  ];
  test.each(stateCases)("%s", async (_label, raw, expected) => {
    const json = JSON.parse(GH_JSON);
    if (raw === "") delete json.state; else json.state = raw;
    const { runner } = fakeRunner({ stdout: JSON.stringify(json), stderr: "", exitCode: 0 });
    const meta = await createGhPrService(runner).fetchPr(REF);
    expect(meta.state).toBe(expected);
  });

  test("throws on non-zero exit", async () => {
    const { runner } = fakeRunner({ stdout: "", stderr: "not found", exitCode: 1 });
    await expect(createGhPrService(runner).fetchPr(REF)).rejects.toThrow();
  });

  test("treats a missing body as empty string", async () => {
    const raw = JSON.parse(GH_JSON);
    delete raw.body;
    const { runner } = fakeRunner({ stdout: JSON.stringify(raw), stderr: "", exitCode: 0 });
    const meta = await createGhPrService(runner).fetchPr(REF);
    expect(meta.body).toBe("");
  });
});

describe("normalizeBody", () => {
  const cases: Array<[string, string, string]> = [
    ["strips CRLF to LF", "a\r\nb", "a\nb"],
    ["trims surrounding whitespace/newlines", "\n\n  hello  \n\n", "hello"],
    ["collapses a whitespace-only body to empty", "  \r\n \t \n ", ""],
    ["passes non-string through as empty", "", ""],
  ];
  test.each(cases)("%s", (_label, input, expected) => {
    expect(normalizeBody(input)).toBe(expected);
  });

  const nonStrings: Array<[string, unknown]> = [
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
  ];
  test.each(nonStrings)("returns empty for a %s body", (_label, input) => {
    expect(normalizeBody(input)).toBe("");
  });
});
