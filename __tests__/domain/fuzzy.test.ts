import { describe, expect, test } from "bun:test";
import { fuzzyFilter, fuzzyScore } from "@/domain/fuzzy.ts";

describe("fuzzyScore", () => {
  test("returns null when the query is not a subsequence", () => {
    expect(fuzzyScore("acb", "abc")).toBeNull();
  });
  test("matches a subsequence (case-insensitive)", () => {
    expect(fuzzyScore("AB", "xaby")).not.toBeNull();
  });
  test("scores a contiguous match higher than a scattered one", () => {
    const contiguous = fuzzyScore("app", "app.ts")!;
    const scattered = fuzzyScore("app", "a_p_p.ts")!;
    expect(contiguous).toBeGreaterThan(scattered);
  });
});

describe("fuzzyFilter", () => {
  test("empty query returns items unchanged", () => {
    expect(fuzzyFilter("", ["b.ts", "a.ts"])).toEqual(["b.ts", "a.ts"]);
  });

  test("excludes non-matches and ranks better matches first", () => {
    const out = fuzzyFilter("abc", ["acb", "axbxc", "abc"]);
    expect(out).not.toContain("acb");
    expect(out[0]).toBe("abc");
    expect(out).toContain("axbxc");
  });

  test("matches across path separators by basename content", () => {
    expect(fuzzyFilter("index", ["src/index.ts", "indent.ts"])).toEqual(["src/index.ts"]);
  });
});
