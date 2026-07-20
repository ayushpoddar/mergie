import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { listRelFiles, newArtifacts } from "@/daemon/artifactCapture.ts";

const ROOT = join(realpathSync("/tmp"), "mergie-artifact-test");
mkdirSync(ROOT, { recursive: true });
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("listRelFiles", () => {
  test("lists files recursively as relative paths", () => {
    const dir = join(ROOT, "list");
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "a.html"), "x");
    writeFileSync(join(dir, "sub", "b.md"), "y");
    expect(listRelFiles(dir).sort()).toEqual(["a.html", "sub/b.md"]);
  });

  test("returns [] for a missing directory", () => {
    expect(listRelFiles(join(ROOT, "does-not-exist"))).toEqual([]);
  });
});

describe("newArtifacts", () => {
  test("records only files that appeared since the snapshot", () => {
    const dir = join(ROOT, "cap");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "old.txt"), "x");
    const before = new Set(listRelFiles(dir));
    writeFileSync(join(dir, "explainer.html"), "<html>");
    const rows = newArtifacts(dir, before, { rangeStartSha: "s", rangeEndSha: "e", sessionId: 7, now: 123 });
    expect(rows).toEqual([
      { rangeStartSha: "s", rangeEndSha: "e", sessionId: 7, relPath: "explainer.html", title: "explainer.html", createdAt: 123 },
    ]);
  });
});
