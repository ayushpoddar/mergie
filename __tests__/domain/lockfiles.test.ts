import { describe, expect, test } from "bun:test";
import { isLockfile } from "@/domain/lockfiles.ts";

const PATTERNS = ["package-lock.json", "yarn.lock", "*.min.js", "vendor/**"];

/** [path, expected] */
const CASES: Array<[string, boolean]> = [
  ["package-lock.json", true],
  ["web/package-lock.json", true], // basename match under a subdir
  ["a/b/yarn.lock", true],
  ["dist/app.min.js", true], // *.min.js via basename
  ["vendor/anything/here.go", true], // path glob
  ["src/index.ts", false],
  ["notes/yarn.lock.md", false],
];

describe("isLockfile", () => {
  test.each(CASES)("%s -> %p", (path, expected) => {
    expect(isLockfile(path, PATTERNS)).toBe(expected);
  });

  test("returns false when no patterns given", () => {
    expect(isLockfile("package-lock.json", [])).toBe(false);
  });
});
