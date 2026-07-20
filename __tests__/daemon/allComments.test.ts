import { describe, expect, test } from "bun:test";
import { mergeAllComments, type AllCommentEntry } from "@/daemon/allComments.ts";
import type { CommentRow } from "@/db/repositories/comments.ts";
import type { GithubThread, ThreadComment } from "@/daemon/githubThreads.ts";

/** Build a local comment row with sensible defaults. */
function local(over: Partial<CommentRow> = {}): CommentRow {
  return {
    id: 1, kind: "lines", side: "RIGHT", path: "src/a.ts", anchorHash: "h",
    startLine: 3, endLine: 5, madeAtSha: "sha1", body: "local body",
    createdAt: 1000, updatedAt: 1000, githubId: null, githubUrl: null,
    inReplyToGithubId: null, ...over,
  };
}

/** Build a thread-comment. */
function tc(over: Partial<ThreadComment> = {}): ThreadComment {
  return { githubId: "g1", author: "alice", body: "gh body", createdAt: 2000, htmlUrl: "https://gh/c1", ...over };
}

/** Build a github thread rooted at `root`. */
function thread(over: Partial<GithubThread> = {}): GithubThread {
  return { path: "src/a.ts", side: "RIGHT", line: 4, root: tc(), replies: [], ...over };
}

const byKey = (entries: AllCommentEntry[]): Map<string, AllCommentEntry> =>
  new Map(entries.map((e) => [e.key, e]));

describe("mergeAllComments", () => {
  test("local-only comment → origin 'local', mine, with local actions", () => {
    const [e] = mergeAllComments([local({ id: 7 })], [], "me");
    expect(e).toMatchObject({
      key: "local:7", origin: "local", mine: true, author: "You",
      path: "src/a.ts", side: "RIGHT", body: "local body", localId: 7,
      madeAtSha: "sha1", githubUrl: null, githubId: null, replyCount: 0,
    });
  });

  test("posted comment matched to its fetched thread → single deduped entry with reply count", () => {
    const entries = mergeAllComments(
      [local({ id: 8, githubId: "100", githubUrl: "https://gh/100" })],
      [thread({ root: tc({ githubId: "100", author: "me" }), replies: [tc({ githubId: "101" }), tc({ githubId: "102" })] })],
      "me",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      key: "local:8", origin: "posted", mine: true, localId: 8,
      githubUrl: "https://gh/100", githubId: "100", replyCount: 2,
    });
  });

  test("others' github thread → origin 'github', not mine, author login, no local actions", () => {
    const [e] = mergeAllComments([], [thread({ root: tc({ githubId: "200", author: "alice" }), replies: [tc({ githubId: "201" })] })], "me");
    expect(e).toMatchObject({
      key: "gh:200", origin: "github", mine: false, author: "alice",
      localId: null, madeAtSha: null, githubUrl: "https://gh/c1", githubId: "200", replyCount: 1,
    });
  });

  test("my own github-authored thread (fetched, not via mergie) → origin 'github', mine", () => {
    const [e] = mergeAllComments([], [thread({ root: tc({ githubId: "300", author: "me" }) })], "me");
    expect(e).toMatchObject({ key: "gh:300", origin: "github", mine: true, author: "You" });
  });

  test("posted comment with no matching fetched thread → origin 'posted', replyCount 0", () => {
    const [e] = mergeAllComments([local({ id: 9, githubId: "400", githubUrl: "https://gh/400" })], [], "me");
    expect(e).toMatchObject({ key: "local:9", origin: "posted", mine: true, replyCount: 0 });
  });

  test("covers all four categories at once, deduped, newest first", () => {
    const entries = mergeAllComments(
      [
        local({ id: 1, createdAt: 100 }),                                   // local-only
        local({ id: 2, githubId: "100", createdAt: 400 }),                  // posted (matches thread 100)
      ],
      [
        thread({ root: tc({ githubId: "100", author: "me", createdAt: 400 }) }), // dup of posted → dropped
        thread({ root: tc({ githubId: "200", author: "alice", createdAt: 300 }) }), // others
        thread({ root: tc({ githubId: "300", author: "me", createdAt: 200 }) }),    // my github
      ],
      "me",
    );
    expect(entries.map((e) => e.key)).toEqual(["local:2", "gh:200", "gh:300", "local:1"]);
    const m = byKey(entries);
    expect(m.get("local:2")!.origin).toBe("posted");
    expect(m.get("gh:200")!.mine).toBe(false);
    expect(m.get("gh:300")!.mine).toBe(true);
    expect(m.get("local:1")!.origin).toBe("local");
  });

  test("location strings reflect the anchor", () => {
    const hunk = mergeAllComments([local({ id: 1, kind: "hunk", startLine: null, endLine: null })], [], "me")[0]!;
    const oneLine = mergeAllComments([local({ id: 2, kind: "lines", startLine: 5, endLine: 5 })], [], "me")[0]!;
    const range = mergeAllComments([local({ id: 3, kind: "lines", startLine: 5, endLine: 8 })], [], "me")[0]!;
    const gh = mergeAllComments([], [thread({ line: 42 })], "me")[0]!;
    expect(hunk.location).toBe("whole hunk");
    expect(oneLine.location).toBe("line 5");
    expect(range.location).toBe("lines 5–8");
    expect(gh.location).toBe("line 42");
  });

  test("empty viewer login classifies all github comments as not mine", () => {
    const e = mergeAllComments([], [thread({ root: tc({ githubId: "500", author: "me" }) })], "")[0]!;
    expect(e.mine).toBe(false);
  });
});
