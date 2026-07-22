import { describe, expect, test } from "bun:test";
import { buildRangeView, type BuildRangeDeps } from "@/daemon/reviewService.ts";
import { commentAnchorHash } from "@/domain/hash.ts";
import type { CommentRow } from "@/db/repositories/comments.ts";
import type { GithubThread } from "@/daemon/githubThreads.ts";

function thread(over: Partial<GithubThread>): GithubThread {
  return {
    path: "src/a.ts", side: "RIGHT", line: 2,
    root: { githubId: "1", author: "octocat", body: "why?", createdAt: 100, htmlUrl: "https://gh/1" },
    replies: [], ...over,
  };
}

function comment(over: Partial<CommentRow>): CommentRow {
  return {
    id: 1, kind: "lines", side: "RIGHT", path: "src/a.ts", anchorHash: "",
    startLine: null, endLine: null, madeAtSha: "e", body: "hi",
    createdAt: 1, updatedAt: 1, githubId: null, githubUrl: null, inReplyToGithubId: null, ...over,
  };
}

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
+const b = 3;
diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-{"v":1}
+{"v":2}
`;

function deps(over: Partial<BuildRangeDeps> = {}): BuildRangeDeps {
  return {
    rawDiff: async () => DIFF,
    isViewed: () => false,
    lockfilePatterns: ["package-lock.json"],
    ...over,
  };
}

describe("buildRangeView", () => {
  test("maps files with paths, hunks, and lock-file flags", async () => {
    const files = await buildRangeView(deps(), "s", "e");
    expect(files.map((f) => f.newPath)).toEqual(["src/a.ts", "package-lock.json"]);
    expect(files.find((f) => f.newPath === "package-lock.json")?.isLockfile).toBe(true);
    expect(files.find((f) => f.newPath === "src/a.ts")?.isLockfile).toBe(false);
    expect(files[0]?.hunks).toHaveLength(1);
  });

  test("hunk + file viewed state is false when nothing is viewed", async () => {
    const files = await buildRangeView(deps({ isViewed: () => false }), "s", "e");
    expect(files[0]?.hunks[0]?.viewed).toBe(false);
    expect(files[0]?.viewed).toBe(false);
  });

  test("a file is auto-viewed when all its hunks are viewed", async () => {
    const files = await buildRangeView(deps({ isViewed: () => true }), "s", "e");
    expect(files[0]?.hunks[0]?.viewed).toBe(true);
    expect(files[0]?.viewed).toBe(true);
  });

  test("passes the range through to rawDiff", async () => {
    const calls: Array<[string, string]> = [];
    await buildRangeView(deps({ rawDiff: async (s, e) => { calls.push([s, e]); return ""; } }), "start9", "end9");
    expect(calls[0]).toEqual(["start9", "end9"]);
  });
});

describe("buildRangeView — large hunks", () => {
  // The src/a.ts hunk in DIFF has 1 deletion + 1 addition = 2 changed lines.
  test("annotates changedLines and leaves isLarge false without a threshold", async () => {
    const h = (await buildRangeView(deps(), "s", "e"))[0]!.hunks[0]!;
    expect(h.changedLines).toBe(2);
    expect(h.isLarge).toBe(false);
  });

  test("marks a hunk large when changed lines reach the threshold", async () => {
    const files = await buildRangeView(deps({ largeDiffThreshold: 2 }), "s", "e");
    expect(files[0]!.hunks[0]!.isLarge).toBe(true);
  });

  test("does not mark large when below the threshold", async () => {
    const files = await buildRangeView(deps({ largeDiffThreshold: 3 }), "s", "e");
    expect(files[0]!.hunks[0]!.isLarge).toBe(false);
  });

  test("a threshold of 0 disables collapsing", async () => {
    const files = await buildRangeView(deps({ largeDiffThreshold: 0 }), "s", "e");
    expect(files[0]!.hunks[0]!.isLarge).toBe(false);
  });
});

describe("buildRangeView — comment anchoring", () => {
  test("attaches a line comment to its line by content hash", async () => {
    const anchor = commentAnchorHash("src/a.ts", "RIGHT", "const b = 3;");
    const files = await buildRangeView(
      deps({ comments: [comment({ id: 5, kind: "lines", side: "RIGHT", anchorHash: anchor, body: "nit" })] }),
      "s", "e",
    );
    const c = files[0]?.hunks[0]?.comments ?? [];
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 5, kind: "lines", side: "RIGHT", lineIndex: 2, body: "nit" });
  });

  test("attaches a whole-hunk comment by hunk hash at lineIndex -1", async () => {
    const bare = await buildRangeView(deps(), "s", "e");
    const hash = bare[0]!.hunks[0]!.hash;
    const files = await buildRangeView(
      deps({ comments: [comment({ id: 6, kind: "hunk", anchorHash: hash, body: "overall" })] }),
      "s", "e",
    );
    expect(files[0]!.hunks[0]!.comments).toEqual([
      { id: 6, body: "overall", side: "RIGHT", kind: "hunk", lineIndex: -1, createdAt: 1, updatedAt: 1, githubUrl: null },
    ]);
  });

  test("attaches a multi-line comment spanning contiguous same-side lines", async () => {
    // RIGHT side lines are the ctx + add lines: "const a = 1;" then "const b = 3;".
    const anchor = commentAnchorHash("src/a.ts", "RIGHT", "const a = 1;\nconst b = 3;");
    const files = await buildRangeView(
      deps({ comments: [comment({ id: 7, kind: "lines", side: "RIGHT", anchorHash: anchor, startLine: 1, endLine: 2 })] }),
      "s", "e",
    );
    const c = files[0]?.hunks[0]?.comments ?? [];
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 7, lineIndex: 0 });
  });

  test("does not attach comments for a different file", async () => {
    const anchor = commentAnchorHash("other.ts", "RIGHT", "const b = 3;");
    const files = await buildRangeView(
      deps({ comments: [comment({ path: "other.ts", anchorHash: anchor })] }),
      "s", "e",
    );
    expect(files[0]!.hunks[0]!.comments).toHaveLength(0);
  });
});

describe("buildRangeView — github thread anchoring", () => {
  test("attaches a RIGHT-side thread to the matching new-side line", async () => {
    const files = await buildRangeView(deps({ githubThreads: [thread({ side: "RIGHT", line: 2 })] }), "s", "e");
    const threads = files[0]?.hunks[0]?.githubThreads ?? [];
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ lineIndex: 2, root: { githubId: "1" } });
  });

  test("attaches a LEFT-side thread to the matching old-side line", async () => {
    const files = await buildRangeView(deps({ githubThreads: [thread({ side: "LEFT", line: 2 })] }), "s", "e");
    const threads = files[0]?.hunks[0]?.githubThreads ?? [];
    expect(threads[0]).toMatchObject({ lineIndex: 1 });
  });

  test("hides a thread whose line is not present in the range", async () => {
    const files = await buildRangeView(deps({ githubThreads: [thread({ line: 99 })] }), "s", "e");
    expect(files[0]?.hunks[0]?.githubThreads).toHaveLength(0);
  });

  test("hides a thread anchored to a different file", async () => {
    const files = await buildRangeView(deps({ githubThreads: [thread({ path: "other.ts" })] }), "s", "e");
    expect(files[0]?.hunks[0]?.githubThreads).toHaveLength(0);
  });

  test("de-duplicates: a local comment already synced as a thread is not shown twice", async () => {
    const anchor = commentAnchorHash("src/a.ts", "RIGHT", "const b = 3;");
    const files = await buildRangeView(
      deps({
        comments: [comment({ id: 9, kind: "lines", side: "RIGHT", anchorHash: anchor, githubId: "700" })],
        githubThreads: [thread({ side: "RIGHT", line: 2, root: { githubId: "700", author: "me", body: "mine", createdAt: 1, htmlUrl: "https://gh/700" } })],
      }),
      "s", "e",
    );
    // The synced thread stands in for the posted local comment.
    expect(files[0]?.hunks[0]?.comments).toHaveLength(0);
    expect(files[0]?.hunks[0]?.githubThreads).toHaveLength(1);
  });
});
