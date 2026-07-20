import { describe, expect, test } from "bun:test";
import { filterAllComments, type CommentFilters } from "@/web/lib/commentFilters.ts";
import type { AllCommentEntry } from "@/daemon/allComments.ts";

/** Build an entry with sensible defaults. */
function entry(over: Partial<AllCommentEntry> = {}): AllCommentEntry {
  return {
    key: "local:1", origin: "local", mine: true, author: "You", path: "src/a.ts",
    side: "RIGHT", location: "line 1", body: "b", createdAt: 1, replyCount: 0,
    localId: 1, madeAtSha: "sha", githubUrl: null, githubId: null, ...over,
  };
}

const ENTRIES: AllCommentEntry[] = [
  entry({ key: "local:1", origin: "local", mine: true, path: "a.ts" }),
  entry({ key: "local:2", origin: "posted", mine: true, path: "a.ts", githubUrl: "u" }),
  entry({ key: "gh:1", origin: "github", mine: true, path: "b.ts", author: "You" }),
  entry({ key: "gh:2", origin: "github", mine: false, path: "b.ts", author: "alice" }),
];

const keys = (es: AllCommentEntry[]): string[] => es.map((e) => e.key);
const ALL: CommentFilters = { author: "all", source: "all", file: "" };

describe("filterAllComments", () => {
  test("no filters → everything", () => {
    expect(keys(filterAllComments(ENTRIES, ALL))).toEqual(["local:1", "local:2", "gh:1", "gh:2"]);
  });

  test("author=mine excludes others", () => {
    expect(keys(filterAllComments(ENTRIES, { ...ALL, author: "mine" }))).toEqual(["local:1", "local:2", "gh:1"]);
  });

  test("author=others keeps only others' comments", () => {
    expect(keys(filterAllComments(ENTRIES, { ...ALL, author: "others" }))).toEqual(["gh:2"]);
  });

  test("source 'local' is only never-posted local drafts", () => {
    expect(keys(filterAllComments(ENTRIES, { ...ALL, source: "local" }))).toEqual(["local:1"]);
  });

  test("source 'github' includes posted-from-mergie AND fetched GitHub comments", () => {
    // A posted comment is a GitHub comment — it lives in the GitHub bucket, not local.
    expect(keys(filterAllComments(ENTRIES, { ...ALL, source: "github" }))).toEqual(["local:2", "gh:1", "gh:2"]);
  });

  test("file filter matches the path", () => {
    expect(keys(filterAllComments(ENTRIES, { ...ALL, file: "b.ts" }))).toEqual(["gh:1", "gh:2"]);
  });

  test("filters combine (author=mine + source=github → my posted + my github comments)", () => {
    expect(keys(filterAllComments(ENTRIES, { ...ALL, author: "mine", source: "github" }))).toEqual(["local:2", "gh:1"]);
  });

  test("does not mutate the input array", () => {
    const input = [...ENTRIES];
    filterAllComments(input, { ...ALL, author: "others" });
    expect(input).toEqual(ENTRIES);
  });
});
