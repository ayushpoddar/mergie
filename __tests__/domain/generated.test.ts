import { describe, expect, test } from "bun:test";
import { isTestPath } from "@/domain/generated.ts";

describe("isTestPath", () => {
  // [path, expected]
  const cases: Array<[string, boolean]> = [
    ["src/foo/__tests__/bar.ts", true],
    ["src/foo/bar.test.ts", true],
    ["src/foo/bar.spec.tsx", true],
    ["test/helpers.ts", true],
    ["tests/helpers.ts", true],
    ["pkg/test/util.go", true],
    ["pkg/tests/util.go", true],
    ["src/foo/bar.ts", false],
    ["src/latest/thing.ts", false], // "test" inside a longer word must not match
    ["src/contest/thing.ts", false],
    ["src/spectacular.ts", false], // "spec" inside a longer word must not match
  ];

  test.each(cases)("isTestPath(%p) === %p", (path, expected) => {
    expect(isTestPath(path)).toBe(expected);
  });
});
