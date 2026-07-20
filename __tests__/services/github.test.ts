import { describe, expect, test } from "bun:test";
import type { CommandResult, CommandRunner, RunOptions } from "@/services/exec.ts";
import {
  createGithubService,
  type GithubComment,
  type CommentThread,
} from "@/services/github.ts";

// ---------------------------------------------------------------------------
// Fake runner
// ---------------------------------------------------------------------------

/** A single recorded call from the fake runner. */
interface RecordedCall {
  /** The command name passed to run(). */
  cmd: string;
  /** The argument list passed to run(). */
  args: string[];
  /** Options forwarded to run(). */
  opts: RunOptions | undefined;
}

/** Fake CommandRunner that records every call and returns canned output. */
function makeFakeRunner(responses: Record<string, CommandResult>): {
  runner: CommandRunner;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const runner: CommandRunner = {
    async run(cmd, args, opts) {
      calls.push({ cmd, args, opts });
      // Key by "cmd args[0]" — first arg is the gh subcommand path
      const key = [cmd, ...args].join(" ");
      for (const [pattern, result] of Object.entries(responses)) {
        if (key.includes(pattern)) return result;
      }
      return { stdout: "", stderr: "no canned response", exitCode: 1 };
    },
  };
  return { runner, calls };
}

// ---------------------------------------------------------------------------
// Canned API data
// ---------------------------------------------------------------------------

/** Root comment — right side, single line. */
const ROOT_COMMENT_RAW = {
  id: 101,
  path: "src/foo.ts",
  side: "RIGHT",
  line: 42,
  start_line: null,
  original_line: 42,
  original_start_line: null,
  commit_id: "abc123",
  body: "Why is this duplicated?",
  user: { login: "alice" },
  created_at: "2024-01-10T10:00:00Z",
  in_reply_to_id: null,
  diff_hunk: "@@ -1,3 +1,4 @@\n context\n+added line\n context",
  html_url: "https://github.com/owner/repo/pull/1#discussion_r101",
};

/** Reply to ROOT_COMMENT_RAW. */
const REPLY_COMMENT_RAW = {
  id: 202,
  path: "src/foo.ts",
  side: "RIGHT",
  line: 42,
  start_line: null,
  original_line: 42,
  original_start_line: null,
  commit_id: "abc123",
  body: "Good catch, will fix.",
  user: { login: "bob" },
  created_at: "2024-01-10T11:00:00Z",
  in_reply_to_id: 101,
  diff_hunk: "@@ -1,3 +1,4 @@\n context\n+added line\n context",
  html_url: "https://github.com/owner/repo/pull/1#discussion_r202",
};

/** Left-side multi-line (hunk) comment — has start_line. */
const MULTILINE_COMMENT_RAW = {
  id: 303,
  path: "src/bar.ts",
  side: "LEFT",
  line: 20,
  start_line: 15,
  original_line: 20,
  original_start_line: 15,
  commit_id: "def456",
  body: "This whole block looks off.",
  user: { login: "alice" },
  created_at: "2024-01-10T09:00:00Z",
  in_reply_to_id: null,
  diff_hunk: "@@ -15,6 +15,4 @@\n-old1\n-old2\n-old3\n+new1\n context",
  html_url: "https://github.com/owner/repo/pull/1#discussion_r303",
};

const CANNED_LIST = JSON.stringify([ROOT_COMMENT_RAW, REPLY_COMMENT_RAW, MULTILINE_COMMENT_RAW]);

const CANNED_POST = JSON.stringify({
  id: 999,
  html_url: "https://github.com/owner/repo/pull/1#discussion_r999",
});

const CANNED_REPLY = JSON.stringify({
  id: 888,
  html_url: "https://github.com/owner/repo/pull/1#discussion_r888",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REF = { owner: "owner", repo: "repo", number: 1 } as const;

function makeService(responses: Record<string, CommandResult>) {
  const { runner, calls } = makeFakeRunner(responses);
  const svc = createGithubService(REF, runner);
  return { svc, calls };
}

// ---------------------------------------------------------------------------
// Tests: listReviewComments
// ---------------------------------------------------------------------------

describe("listReviewComments", () => {
  test("calls gh api with --paginate", async () => {
    const { svc, calls } = makeService({
      "repos/owner/repo/pulls/1/comments": { stdout: CANNED_LIST, stderr: "", exitCode: 0 },
    });
    await svc.listReviewComments();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toBe("gh");
    expect(calls[0]?.args).toContain("--paginate");
    expect(calls[0]?.args).toContain("repos/owner/repo/pulls/1/comments");
  });

  test("maps raw GitHub JSON to GithubComment[]", async () => {
    const { svc } = makeService({
      "repos/owner/repo/pulls/1/comments": { stdout: CANNED_LIST, stderr: "", exitCode: 0 },
    });
    const comments = await svc.listReviewComments();

    expect(comments).toHaveLength(3);

    const root = comments.find((c) => c.id === 101);
    const expectedRoot: GithubComment = {
      id: 101,
      path: "src/foo.ts",
      side: "RIGHT",
      line: 42,
      startLine: null,
      commitId: "abc123",
      body: "Why is this duplicated?",
      author: "alice",
      createdAtIso: "2024-01-10T10:00:00Z",
      inReplyToId: null,
      diffHunk: ROOT_COMMENT_RAW.diff_hunk,
      htmlUrl: "https://github.com/owner/repo/pull/1#discussion_r101",
    };
    expect(root).toMatchObject(expectedRoot);

    const reply = comments.find((c) => c.id === 202);
    expect(reply?.inReplyToId).toBe(101);

    const multi = comments.find((c) => c.id === 303);
    const expectedMulti: GithubComment = {
      id: 303,
      path: "src/bar.ts",
      side: "LEFT",
      line: 20,
      startLine: 15,
      commitId: "def456",
      body: "This whole block looks off.",
      author: "alice",
      createdAtIso: "2024-01-10T09:00:00Z",
      inReplyToId: null,
      diffHunk: MULTILINE_COMMENT_RAW.diff_hunk,
      htmlUrl: "https://github.com/owner/repo/pull/1#discussion_r303",
    };
    expect(multi).toMatchObject(expectedMulti);
  });

  test("throws when gh exits non-zero", async () => {
    const { svc } = makeService({
      "repos/owner/repo/pulls/1/comments": {
        stdout: "",
        stderr: "Not Found",
        exitCode: 1,
      },
    });
    await expect(svc.listReviewComments()).rejects.toThrow("Not Found");
  });
});

// ---------------------------------------------------------------------------
// Tests: buildThreads
// ---------------------------------------------------------------------------

describe("buildThreads", () => {
  test("groups root + reply into one thread, ordered by createdAt", () => {
    const { svc } = makeService({});
    const rootComment: GithubComment = {
      id: 101,
      path: "src/foo.ts",
      side: "RIGHT",
      line: 42,
      startLine: null,
      commitId: "abc123",
      body: "Why?",
      author: "alice",
      createdAtIso: "2024-01-10T10:00:00Z",
      inReplyToId: null,
      diffHunk: "@@ @@",
      htmlUrl: "https://example.com/r101",
    };
    const replyComment: GithubComment = {
      id: 202,
      path: "src/foo.ts",
      side: "RIGHT",
      line: 42,
      startLine: null,
      commitId: "abc123",
      body: "Will fix.",
      author: "bob",
      createdAtIso: "2024-01-10T11:00:00Z",
      inReplyToId: 101,
      diffHunk: "@@ @@",
      htmlUrl: "https://example.com/r202",
    };

    const threads = svc.buildThreads([rootComment, replyComment]);

    expect(threads).toHaveLength(1);
    const thread = threads[0] as CommentThread;
    expect(thread.root.id).toBe(101);
    expect(thread.replies).toHaveLength(1);
    expect(thread.replies[0]?.id).toBe(202);
  });

  test("handles orphan reply gracefully — places it in its own thread", () => {
    const { svc } = makeService({});
    const orphan: GithubComment = {
      id: 404,
      path: "src/baz.ts",
      side: "LEFT",
      line: 5,
      startLine: null,
      commitId: "xxx",
      body: "Orphan reply",
      author: "charlie",
      createdAtIso: "2024-01-11T08:00:00Z",
      inReplyToId: 999, // parent doesn't exist in the array
      diffHunk: "@@ @@",
      htmlUrl: "https://example.com/r404",
    };

    const threads = svc.buildThreads([orphan]);
    // Orphan must not be silently dropped — it forms its own thread
    expect(threads).toHaveLength(1);
    expect(threads[0]?.root.id).toBe(404);
    expect(threads[0]?.replies).toHaveLength(0);
  });

  test("multiple independent roots produce multiple threads", () => {
    const { svc } = makeService({});
    const a: GithubComment = {
      id: 1,
      path: "a.ts",
      side: "RIGHT",
      line: 1,
      startLine: null,
      commitId: "sha1",
      body: "A",
      author: "alice",
      createdAtIso: "2024-01-01T00:00:00Z",
      inReplyToId: null,
      diffHunk: "@@ @@",
      htmlUrl: "https://example.com/r1",
    };
    const b: GithubComment = {
      id: 2,
      path: "b.ts",
      side: "LEFT",
      line: 2,
      startLine: null,
      commitId: "sha2",
      body: "B",
      author: "bob",
      createdAtIso: "2024-01-01T01:00:00Z",
      inReplyToId: null,
      diffHunk: "@@ @@",
      htmlUrl: "https://example.com/r2",
    };

    const threads = svc.buildThreads([a, b]);
    expect(threads).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: postComment
// ---------------------------------------------------------------------------

describe("postComment", () => {
  test("sends correct argv for a single-line comment", async () => {
    const { svc, calls } = makeService({
      "repos/owner/repo/pulls/1/comments": { stdout: CANNED_POST, stderr: "", exitCode: 0 },
    });

    const result = await svc.postComment({
      body: "Looks good",
      commitId: "abc123",
      path: "src/foo.ts",
      side: "RIGHT",
      line: 42,
    });

    expect(result).toEqual({ id: 999, htmlUrl: "https://github.com/owner/repo/pull/1#discussion_r999" });

    const call = calls[0];
    expect(call?.cmd).toBe("gh");
    expect(call?.args).toContain("repos/owner/repo/pulls/1/comments");
    expect(call?.args).toContain("--method");
    expect(call?.args).toContain("POST");
    expect(call?.args).toContain("-f");

    // body field
    const bodyIdx = call?.args.indexOf("-f");
    expect(call?.args).toContain("body=Looks good");

    // Required fields
    expect(call?.args).toContain("commit_id=abc123");
    expect(call?.args).toContain("path=src/foo.ts");
    expect(call?.args).toContain("side=RIGHT");
    expect(call?.args).toContain("line=42");

    // start_line must NOT appear for single-line
    const hasStartLine = call?.args.some((a) => a.startsWith("start_line="));
    expect(hasStartLine).toBe(false);
  });

  test("sends correct argv for a multi-line (hunk) comment", async () => {
    const { svc, calls } = makeService({
      "repos/owner/repo/pulls/1/comments": { stdout: CANNED_POST, stderr: "", exitCode: 0 },
    });

    await svc.postComment({
      body: "Whole hunk issue",
      commitId: "abc123",
      path: "src/bar.ts",
      side: "LEFT",
      line: 20,
      startLine: 15,
    });

    const call = calls[0];
    // Multi-line span fields
    expect(call?.args).toContain("start_line=15");
    expect(call?.args).toContain("start_side=LEFT");
    expect(call?.args).toContain("side=LEFT");
    expect(call?.args).toContain("line=20");
  });

  test("throws when gh exits non-zero", async () => {
    const { svc } = makeService({
      "repos/owner/repo/pulls/1/comments": { stdout: "", stderr: "Unprocessable", exitCode: 22 },
    });
    await expect(
      svc.postComment({
        body: "x",
        commitId: "sha",
        path: "p.ts",
        side: "RIGHT",
        line: 1,
      }),
    ).rejects.toThrow("Unprocessable");
  });
});

// ---------------------------------------------------------------------------
// Tests: editComment
// ---------------------------------------------------------------------------

describe("editComment", () => {
  test("calls PATCH on the comment endpoint with new body", async () => {
    const { svc, calls } = makeService({
      "repos/owner/repo/pulls/comments/55": { stdout: "{}", stderr: "", exitCode: 0 },
    });

    await svc.editComment(55, "Updated body");

    const call = calls[0];
    expect(call?.cmd).toBe("gh");
    expect(call?.args).toContain("repos/owner/repo/pulls/comments/55");
    expect(call?.args).toContain("--method");
    expect(call?.args).toContain("PATCH");
    expect(call?.args).toContain("body=Updated body");
  });

  test("throws when gh exits non-zero", async () => {
    const { svc } = makeService({
      "repos/owner/repo/pulls/comments/55": { stdout: "", stderr: "Not Found", exitCode: 1 },
    });
    await expect(svc.editComment(55, "x")).rejects.toThrow("Not Found");
  });
});

// ---------------------------------------------------------------------------
// Tests: deleteComment
// ---------------------------------------------------------------------------

describe("deleteComment", () => {
  test("calls DELETE on the comment endpoint", async () => {
    const { svc, calls } = makeService({
      "repos/owner/repo/pulls/comments/77": { stdout: "", stderr: "", exitCode: 0 },
    });

    await svc.deleteComment(77);

    const call = calls[0];
    expect(call?.cmd).toBe("gh");
    expect(call?.args).toContain("repos/owner/repo/pulls/comments/77");
    expect(call?.args).toContain("--method");
    expect(call?.args).toContain("DELETE");
  });

  test("throws when gh exits non-zero", async () => {
    const { svc } = makeService({
      "repos/owner/repo/pulls/comments/77": { stdout: "", stderr: "Forbidden", exitCode: 1 },
    });
    await expect(svc.deleteComment(77)).rejects.toThrow("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// Tests: replyToComment
// ---------------------------------------------------------------------------

describe("replyToComment", () => {
  test("calls POST on the replies endpoint with body field", async () => {
    const { svc, calls } = makeService({
      "repos/owner/repo/pulls/1/comments/101/replies": {
        stdout: CANNED_REPLY,
        stderr: "",
        exitCode: 0,
      },
    });

    const result = await svc.replyToComment(101, "Thanks for the review");

    expect(result).toEqual({ id: 888, htmlUrl: "https://github.com/owner/repo/pull/1#discussion_r888" });

    const call = calls[0];
    expect(call?.cmd).toBe("gh");
    expect(call?.args).toContain("repos/owner/repo/pulls/1/comments/101/replies");
    expect(call?.args).toContain("--method");
    expect(call?.args).toContain("POST");
    expect(call?.args).toContain("body=Thanks for the review");
  });

  test("throws when gh exits non-zero", async () => {
    const { svc } = makeService({
      "repos/owner/repo/pulls/1/comments/101/replies": {
        stdout: "",
        stderr: "Not Found",
        exitCode: 1,
      },
    });
    await expect(svc.replyToComment(101, "x")).rejects.toThrow("Not Found");
  });
});

// ---------------------------------------------------------------------------
// Tests: viewer
// ---------------------------------------------------------------------------

describe("viewer", () => {
  test("returns the authenticated user's login via gh api user", async () => {
    // `gh api user --jq .login` returns the bare login string, not JSON.
    const { svc, calls } = makeService({ "user": { stdout: "octocat\n", stderr: "", exitCode: 0 } });
    const login = await svc.viewer();
    expect(login).toBe("octocat");
    expect(calls[0]?.args).toContain("user");
  });

  test("returns empty string when gh fails (offline / unauthenticated)", async () => {
    const { svc } = makeService({ "user": { stdout: "", stderr: "auth error", exitCode: 1 } });
    expect(await svc.viewer()).toBe("");
  });
});
