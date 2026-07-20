import { describe, expect, test } from "bun:test";
import { parseUnifiedDiff } from "@/domain/diff.ts";

const MODIFIED = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ export function f()
 const a = 1;
-const b = 2;
+const b = 3;
 const c = 4;
`;

const ADDED = `diff --git a/new.txt b/new.txt
new file mode 100644
index 000..abc
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
`;

const DELETED = `diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index abc..000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-now
`;

const RENAMED = `diff --git a/old/name.ts b/new/name.ts
similarity index 100%
rename from old/name.ts
rename to new/name.ts
`;

const BINARY = `diff --git a/img.png b/img.png
index abc..def 100644
Binary files a/img.png and b/img.png differ
`;

describe("parseUnifiedDiff — file metadata", () => {
  test("modified file: paths, status, not binary, one hunk", () => {
    const [f] = parseUnifiedDiff(MODIFIED);
    expect(f).toMatchObject({
      oldPath: "src/a.ts",
      newPath: "src/a.ts",
      status: "modified",
      isBinary: false,
    });
    expect(f!.hunks).toHaveLength(1);
  });

  test("added / deleted / renamed / binary statuses", () => {
    expect(parseUnifiedDiff(ADDED)[0]).toMatchObject({ status: "added", newPath: "new.txt" });
    expect(parseUnifiedDiff(DELETED)[0]).toMatchObject({ status: "deleted", oldPath: "gone.txt" });
    expect(parseUnifiedDiff(RENAMED)[0]).toMatchObject({
      status: "renamed",
      oldPath: "old/name.ts",
      newPath: "new/name.ts",
    });
    const bin = parseUnifiedDiff(BINARY)[0]!;
    expect(bin.isBinary).toBe(true);
    expect(bin.hunks).toHaveLength(0);
  });

  test("parses multiple files in one diff", () => {
    expect(parseUnifiedDiff(MODIFIED + ADDED)).toHaveLength(2);
  });
});

describe("parseUnifiedDiff — hunk contents", () => {
  test("hunk header ranges and line kinds / numbers", () => {
    const hunk = parseUnifiedDiff(MODIFIED)[0]!.hunks[0]!;
    expect(hunk).toMatchObject({ oldStart: 1, oldLines: 3, newStart: 1, newLines: 3 });
    expect(hunk.lines).toEqual([
      { kind: "ctx", oldNo: 1, newNo: 1, text: "const a = 1;" },
      { kind: "del", oldNo: 2, newNo: undefined, text: "const b = 2;" },
      { kind: "add", oldNo: undefined, newNo: 2, text: "const b = 3;" },
      { kind: "ctx", oldNo: 3, newNo: 3, text: "const c = 4;" },
    ]);
  });

  test("header without explicit counts defaults to 1 line each", () => {
    const hunk = parseUnifiedDiff(`diff --git a/x b/x
--- a/x
+++ b/x
@@ -5 +7 @@
-old
+new
`)[0]!.hunks[0]!;
    expect(hunk).toMatchObject({ oldStart: 5, oldLines: 1, newStart: 7, newLines: 1 });
  });

  test("ignores '\\\\ No newline at end of file' markers", () => {
    const hunk = parseUnifiedDiff(`diff --git a/x b/x
--- a/x
+++ b/x
@@ -1 +1 @@
-a
\\ No newline at end of file
+b
\\ No newline at end of file
`)[0]!.hunks[0]!;
    expect(hunk.lines.map((l) => l.kind)).toEqual(["del", "add"]);
  });
});

describe("parseUnifiedDiff — hunk hashing", () => {
  test("each hunk has a 64-hex hash", () => {
    expect(parseUnifiedDiff(MODIFIED)[0]!.hunks[0]!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("hash is independent of line-number shifts (same body)", () => {
    const at1 = parseUnifiedDiff(`diff --git a/x b/x
--- a/x
+++ b/x
@@ -1,3 +1,3 @@
 a
-b
+c
 d
`)[0]!.hunks[0]!;
    const at50 = parseUnifiedDiff(`diff --git a/x b/x
--- a/x
+++ b/x
@@ -50,3 +52,3 @@
 a
-b
+c
 d
`)[0]!.hunks[0]!;
    expect(at1.hash).toBe(at50.hash);
  });

  test("hash differs when the changed content differs", () => {
    const h1 = parseUnifiedDiff(MODIFIED)[0]!.hunks[0]!.hash;
    const h2 = parseUnifiedDiff(MODIFIED.replace("const b = 3;", "const b = 9;"))[0]!.hunks[0]!.hash;
    expect(h1).not.toBe(h2);
  });
});
