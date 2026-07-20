import { describe, expect, test } from "bun:test";
import { reviewProgress, type ReviewProgress } from "@/web/lib/reviewProgress.ts";
import type { FileView, HunkView } from "@/daemon/reviewService.ts";

function hunk(hash: string, viewed: boolean): HunkView {
  return { hash, header: "@@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [], viewed, comments: [], githubThreads: [] };
}
function file(newPath: string, hunks: HunkView[], opts: Partial<FileView> = {}): FileView {
  return {
    oldPath: newPath, newPath, status: "modified", isBinary: false,
    isLockfile: false, viewed: hunks.length > 0 && hunks.every((h) => h.viewed), hunks, ...opts,
  };
}

/** [label, files, expected] — counts viewed hunks against every hunk in the range. */
const CASES: ReadonlyArray<[string, FileView[], ReviewProgress]> = [
  ["no files", [], { viewed: 0, total: 0 }],
  ["single unviewed hunk", [file("a.ts", [hunk("a1", false)])], { viewed: 0, total: 1 }],
  ["single viewed hunk", [file("a.ts", [hunk("a1", true)])], { viewed: 1, total: 1 }],
  [
    "mixed across files",
    [
      file("a.ts", [hunk("a1", true), hunk("a2", false)]),
      file("b.ts", [hunk("b1", true), hunk("b2", true), hunk("b3", false)]),
    ],
    { viewed: 3, total: 5 },
  ],
  [
    "lock/generated files count too",
    [
      file("src/x.ts", [hunk("x1", true)]),
      file("package-lock.json", [hunk("l1", false), hunk("l2", false)], { isLockfile: true }),
    ],
    { viewed: 1, total: 3 },
  ],
  ["file with no hunks contributes nothing", [file("empty.ts", [])], { viewed: 0, total: 0 }],
];

describe("reviewProgress", () => {
  test.each(CASES)("%s", (_label, files, expected) => {
    expect(reviewProgress(files)).toEqual(expected);
  });

  test("does not mutate its input", () => {
    const files = [file("a.ts", [hunk("a1", true)])];
    const snapshot = JSON.stringify(files);
    reviewProgress(files);
    expect(JSON.stringify(files)).toEqual(snapshot);
  });
});
