import { describe, expect, test } from "bun:test";
import { commentVisibleInDiff, classifyCommentClick } from "@/web/lib/commentVisibility.ts";
import type { AllCommentEntry } from "@/daemon/allComments.ts";
import type { FileView } from "@/daemon/reviewService.ts";

/** Build an All-comments entry with sensible defaults. */
function entry(over: Partial<AllCommentEntry> = {}): AllCommentEntry {
  return {
    key: "local:1", origin: "local", mine: true, author: "You", path: "src/a.ts",
    side: "RIGHT", location: "line 1", body: "b", createdAt: 1, replyCount: 0,
    localId: 1, madeAtSha: "sha", githubUrl: null, githubId: null, ...over,
  };
}

/** Build a FileView carrying the given local comment ids and github thread ids. */
function file(over: { newPath?: string; hash?: string; localIds?: number[]; githubIds?: string[] } = {}): FileView {
  const localIds = over.localIds ?? [];
  const githubIds = over.githubIds ?? [];
  return {
    oldPath: over.newPath ?? "src/a.ts",
    newPath: over.newPath ?? "src/a.ts",
    status: "modified",
    isBinary: false,
    isLockfile: false,
    viewed: false,
    hunks: [{
      hash: over.hash ?? "h1", header: "@@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
      lines: [], viewed: false,
      comments: localIds.map((id) => ({
        id, body: "b", side: "RIGHT", kind: "lines", lineIndex: 0,
        createdAt: 1, updatedAt: 1, githubUrl: null,
      })),
      githubThreads: githubIds.map((gid) => ({
        path: "src/a.ts", side: "RIGHT", line: 1, lineIndex: 0,
        root: { githubId: gid, author: "x", body: "b", htmlUrl: "u", createdAt: 1 },
        replies: [],
      })),
    }],
  };
}

describe("commentVisibleInDiff", () => {
  test("local comment whose id is rendered in a hunk is visible", () => {
    const files = [file({ localIds: [1] })];
    expect(commentVisibleInDiff(entry({ localId: 1 }), files)).toBe(true);
  });

  test("local comment not rendered anywhere is not visible", () => {
    const files = [file({ localIds: [99] })];
    expect(commentVisibleInDiff(entry({ localId: 1 }), files)).toBe(false);
  });

  test("github comment whose thread id is rendered is visible", () => {
    const files = [file({ githubIds: ["gh-7"] })];
    expect(commentVisibleInDiff(entry({ origin: "github", localId: null, githubId: "gh-7" }), files)).toBe(true);
  });

  test("posted comment matches by local id OR its github thread id", () => {
    const byLocal = [file({ localIds: [1] })];
    const byThread = [file({ githubIds: ["gh-7"] })];
    const posted = entry({ origin: "posted", localId: 1, githubId: "gh-7", githubUrl: "u" });
    expect(commentVisibleInDiff(posted, byLocal)).toBe(true);
    expect(commentVisibleInDiff(posted, byThread)).toBe(true);
  });

  test("github comment not rendered is not visible", () => {
    const files = [file({ githubIds: ["other"] })];
    expect(commentVisibleInDiff(entry({ origin: "github", localId: null, githubId: "gh-7" }), files)).toBe(false);
  });

  test("no files → not visible", () => {
    expect(commentVisibleInDiff(entry({ localId: 1 }), [])).toBe(false);
  });
});

describe("classifyCommentClick", () => {
  test("rendered in the current view → scroll", () => {
    const range = [file({ hash: "h1", localIds: [1] })];
    const rendered = range; // nothing hidden
    expect(classifyCommentClick(entry({ localId: 1 }), range, rendered)).toEqual({ kind: "scroll" });
  });

  test("in the range but hidden by a toggle → reveal its hunk", () => {
    const range = [file({ hash: "h1", localIds: [1] })];
    const rendered: FileView[] = []; // hidden (e.g. hide-viewed-hunks removed it)
    expect(classifyCommentClick(entry({ localId: 1 }), range, rendered)).toEqual({ kind: "reveal", hunkHash: "h1" });
  });

  test("not in the range at all → out-of-range", () => {
    const range = [file({ hash: "h1", localIds: [99] })];
    expect(classifyCommentClick(entry({ localId: 1 }), range, [])).toEqual({ kind: "out-of-range" });
  });

  test("reveal resolves the hunk hash for a github-thread comment too", () => {
    const range = [file({ hash: "hz", githubIds: ["gh-7"] })];
    const gh = entry({ origin: "github", localId: null, githubId: "gh-7" });
    expect(classifyCommentClick(gh, range, [])).toEqual({ kind: "reveal", hunkHash: "hz" });
  });
});
