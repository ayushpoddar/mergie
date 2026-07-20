import { describe, expect, test } from "bun:test";
import { localCommentDomId, githubCommentDomId, commentDomIdCandidates } from "@/web/lib/commentVisibility.ts";
import type { AllCommentEntry } from "@/daemon/allComments.ts";

/** Build an entry with sensible defaults. */
function entry(over: Partial<AllCommentEntry> = {}): AllCommentEntry {
  return {
    key: "local:1", origin: "local", mine: true, author: "You", path: "src/a.ts",
    side: "RIGHT", location: "line 1", body: "b", createdAt: 1, replyCount: 0,
    localId: 1, madeAtSha: "sha", githubUrl: null, githubId: null, ...over,
  };
}

describe("element id builders", () => {
  test("local comment element id", () => {
    expect(localCommentDomId(5)).toBe("comment-local-5");
  });
  test("github thread element id", () => {
    expect(githubCommentDomId("gh-9")).toBe("comment-gh-gh-9");
  });
});

describe("commentDomIdCandidates (ordered ids to scroll to for an entry)", () => {
  test("github-origin entry → its thread element only", () => {
    expect(commentDomIdCandidates(entry({ origin: "github", localId: null, githubId: "gh-9" })))
      .toEqual(["comment-gh-gh-9"]);
  });
  test("posted entry → thread element first, then its local element (covers pre-fetch render)", () => {
    expect(commentDomIdCandidates(entry({ origin: "posted", localId: 3, githubId: "gh-3", githubUrl: "u" })))
      .toEqual(["comment-gh-gh-3", "comment-local-3"]);
  });
  test("local draft → its local element only", () => {
    expect(commentDomIdCandidates(entry({ localId: 7 }))).toEqual(["comment-local-7"]);
  });
});
