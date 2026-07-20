import { describe, expect, test } from "bun:test";
import { languageForPath } from "@/web/lib/highlight.ts";

/** [path, expected language] */
const CASES: Array<[string, string | undefined]> = [
  ["src/a.ts", "typescript"],
  ["src/a.tsx", "typescript"],
  ["x.js", "javascript"],
  ["pkg.json", "json"],
  ["main.py", "python"],
  ["lib.rs", "rust"],
  ["notes", undefined],
  ["weird.xyz", undefined],
];

describe("languageForPath", () => {
  test.each(CASES)("%s -> %p", (path, lang) => {
    expect(languageForPath(path)).toBe(lang);
  });
});
