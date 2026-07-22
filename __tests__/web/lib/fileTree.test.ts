import { describe, expect, test } from "bun:test";
import { buildFileTree, type TreeNode } from "@/web/lib/fileTree.ts";
import type { FileView, HunkView } from "@/daemon/reviewService.ts";

function hunk(): HunkView {
  return { hash: "h", header: "@@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [], changedLines: 0, isLarge: false, viewed: false, comments: [], githubThreads: [] };
}
function file(newPath: string): FileView {
  return {
    oldPath: newPath, newPath, status: "modified", isBinary: false,
    isLockfile: false, viewed: false, hunks: [hunk()],
  };
}

/** Render a tree to a compact `[dir> ..., file]` shape for readable assertions. */
function shape(nodes: readonly TreeNode[]): unknown[] {
  return nodes.map((n) =>
    n.kind === "dir" ? { [`${n.name}/`]: shape(n.children) } : n.name,
  );
}

describe("buildFileTree", () => {
  test("puts root-level files (no slash) at the top level as leaves", () => {
    const tree = buildFileTree([file("README.md"), file("LICENSE")]);
    // dirs first then files, each alphabetical → LICENSE before README.md
    expect(shape(tree)).toEqual(["LICENSE", "README.md"]);
  });

  test("groups files under their directory", () => {
    const tree = buildFileTree([file("src/a.ts"), file("src/b.ts")]);
    expect(shape(tree)).toEqual([{ "src/": ["a.ts", "b.ts"] }]);
  });

  test("compresses a single-child directory chain into one row (GitHub-style)", () => {
    const tree = buildFileTree([file("src/web/components/A.tsx"), file("src/web/components/B.tsx")]);
    expect(shape(tree)).toEqual([{ "src/web/components/": ["A.tsx", "B.tsx"] }]);
  });

  test("stops compressing where a directory branches", () => {
    const tree = buildFileTree([file("src/a.ts"), file("src/web/b.ts")]);
    // src holds both a file and a subdir, so it is not merged with web
    expect(shape(tree)).toEqual([{ "src/": [{ "web/": ["b.ts"] }, "a.ts"] }]);
  });

  test("orders directories before files, each alphabetically", () => {
    const tree = buildFileTree([file("z.ts"), file("a.ts"), file("lib/x.ts")]);
    expect(shape(tree)).toEqual([{ "lib/": ["x.ts"] }, "a.ts", "z.ts"]);
  });

  test("a compressed directory carries the full path as its id", () => {
    const dir = buildFileTree([file("packages/core/src/index.ts")])[0];
    if (dir?.kind !== "dir") throw new Error("expected a directory node");
    expect(dir.name).toBe("packages/core/src");
    expect(dir.path).toBe("packages/core/src");
  });

  test("a file leaf carries its FileView and basename", () => {
    const fv = file("src/deep/thing.ts");
    const dir = buildFileTree([fv])[0];
    if (dir?.kind !== "dir") throw new Error("expected a directory node");
    const leaf = dir.children[0];
    if (leaf?.kind !== "file") throw new Error("expected a file leaf");
    expect(leaf.name).toBe("thing.ts");
    expect(leaf.file).toBe(fv);
  });

  test("does not mutate the input array", () => {
    const input = [file("src/b.ts"), file("src/a.ts")];
    const before = input.map((f) => f.newPath);
    buildFileTree(input);
    expect(input.map((f) => f.newPath)).toEqual(before);
  });
});
