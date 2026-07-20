import { describe, expect, test } from "bun:test";
import { groupGithubThreads, type GithubThreadRow } from "@/daemon/githubThreads.ts";

function row(over: Partial<GithubThreadRow>): GithubThreadRow {
  return {
    githubId: "1", path: "src/a.ts", side: "RIGHT", line: 2,
    body: "b", author: "octocat", createdAt: 100, inReplyTo: null,
    htmlUrl: "https://gh/1", ...over,
  };
}

describe("groupGithubThreads", () => {
  test("groups replies under their root, sorted oldest-first", () => {
    const rows: GithubThreadRow[] = [
      row({ githubId: "1", inReplyTo: null, createdAt: 100 }),
      row({ githubId: "3", inReplyTo: "1", createdAt: 300, body: "second reply" }),
      row({ githubId: "2", inReplyTo: "1", createdAt: 200, body: "first reply" }),
    ];
    const threads = groupGithubThreads(rows);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.root.githubId).toBe("1");
    expect(threads[0]?.replies.map((r) => r.githubId)).toEqual(["2", "3"]);
  });

  test("normalises the side and carries line/path onto the thread", () => {
    const threads = groupGithubThreads([row({ side: "LEFT", line: 5, path: "src/x.ts" })]);
    expect(threads[0]).toMatchObject({ side: "LEFT", line: 5, path: "src/x.ts" });
  });

  test("a reply whose parent is absent becomes its own thread", () => {
    const threads = groupGithubThreads([row({ githubId: "9", inReplyTo: "404" })]);
    expect(threads).toHaveLength(1);
    expect(threads[0]?.root.githubId).toBe("9");
    expect(threads[0]?.replies).toHaveLength(0);
  });

  test("defaults a missing author to an empty string", () => {
    const threads = groupGithubThreads([row({ author: null })]);
    expect(threads[0]?.root.author).toBe("");
  });
});
