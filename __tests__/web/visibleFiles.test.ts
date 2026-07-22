import { describe, expect, test } from "bun:test";
import { visibleFiles, type VisibilityToggles } from "@/web/lib/visibleFiles.ts";
import type { FileView, HunkView } from "@/daemon/reviewService.ts";

function hunk(hash: string, viewed: boolean): HunkView {
  return { hash, header: "@@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [], changedLines: 0, isLarge: false, viewed, comments: [], githubThreads: [] };
}
function file(newPath: string, opts: Partial<FileView> = {}): FileView {
  return {
    oldPath: newPath, newPath, status: "modified", isBinary: false,
    isLockfile: false, viewed: false, hunks: [hunk("h1", false)], ...opts,
  };
}

const NONE: VisibilityToggles = { hideViewedHunks: false, hideViewedFiles: false, hideLockFiles: false };

const FILES: FileView[] = [
  file("src/a.ts"),
  file("src/b.ts", { viewed: true, hunks: [hunk("hb", true)] }),
  file("package-lock.json", { isLockfile: true }),
];

describe("visibleFiles", () => {
  test("returns all files unchanged with no query or toggles", () => {
    expect(visibleFiles(FILES, "", NONE).map((f) => f.newPath)).toEqual([
      "src/a.ts", "src/b.ts", "package-lock.json",
    ]);
  });

  test("hideLockFiles drops lock files", () => {
    const out = visibleFiles(FILES, "", { ...NONE, hideLockFiles: true });
    expect(out.map((f) => f.newPath)).not.toContain("package-lock.json");
  });

  test("hideViewedFiles drops fully-viewed files", () => {
    const out = visibleFiles(FILES, "", { ...NONE, hideViewedFiles: true });
    expect(out.map((f) => f.newPath)).not.toContain("src/b.ts");
  });

  test("hideViewedHunks removes viewed hunks and files left empty", () => {
    const out = visibleFiles(FILES, "", { ...NONE, hideViewedHunks: true });
    const b = out.find((f) => f.newPath === "src/b.ts");
    expect(b).toBeUndefined(); // its only hunk was viewed
    expect(out.find((f) => f.newPath === "src/a.ts")?.hunks).toHaveLength(1);
  });

  test("query fuzzy-filters the file list", () => {
    const filtered = visibleFiles(FILES, "lock", NONE);
    expect(filtered.map((f) => f.newPath)).toEqual(["package-lock.json"]);
  });

  test("a revealed hunk survives hideViewedHunks (and keeps its file)", () => {
    const out = visibleFiles(FILES, "", { ...NONE, hideViewedHunks: true }, new Set(["hb"]));
    const b = out.find((f) => f.newPath === "src/b.ts");
    expect(b?.hunks.map((h) => h.hash)).toEqual(["hb"]); // kept despite being viewed
  });

  test("a revealed file survives hideViewedFiles", () => {
    const out = visibleFiles(FILES, "", { ...NONE, hideViewedFiles: true }, new Set(["hb"]));
    expect(out.map((f) => f.newPath)).toContain("src/b.ts");
  });

  test("a revealed lock-file hunk survives hideLockFiles", () => {
    const files: FileView[] = [file("package-lock.json", { isLockfile: true, hunks: [hunk("lock-h", false)] })];
    const out = visibleFiles(files, "", { ...NONE, hideLockFiles: true }, new Set(["lock-h"]));
    expect(out.map((f) => f.newPath)).toContain("package-lock.json");
  });
});
