import { describe, expect, test } from "bun:test";
import { filterCodeResults } from "@/web/lib/filterCodeResults.ts";
import type { CodeResult } from "@/services/symbols.ts";

/** Build a minimal CodeResult for filtering tests. */
function make(over: Partial<CodeResult>): CodeResult {
  return {
    path: "src/a.ts",
    line: 1,
    before: [],
    matched: "const x = 1;",
    after: [],
    kind: "search",
    testOrGenerated: false,
    ...over,
  };
}

const RESULTS: CodeResult[] = [
  make({ path: "src/foo/bar.ts", matched: "function alpha() {}" }),
  make({ path: "src/baz/qux.ts", matched: "const beta = 2;", before: ["// GAMMA marker"] }),
  make({ path: "vendor/lib.min.js", matched: "minified", testOrGenerated: true }),
  make({ path: "src/foo/deep.ts", body: "class Delta {}", matched: "class Delta {}" }),
];

describe("filterCodeResults", () => {
  test("no filters returns all results unchanged", () => {
    expect(filterCodeResults(RESULTS, {})).toEqual(RESULTS);
  });

  test("path filter matches a case-insensitive substring of the path", () => {
    const out = filterCodeResults(RESULTS, { pathText: "FOO" });
    expect(out.map((r) => r.path)).toEqual(["src/foo/bar.ts", "src/foo/deep.ts"]);
  });

  test("code filter matches the matched line (case-insensitive)", () => {
    const out = filterCodeResults(RESULTS, { codeText: "ALPHA" });
    expect(out.map((r) => r.matched)).toEqual(["function alpha() {}"]);
  });

  test("code filter also matches context lines (before/after)", () => {
    const out = filterCodeResults(RESULTS, { codeText: "gamma" });
    expect(out.map((r) => r.path)).toEqual(["src/baz/qux.ts"]);
  });

  test("code filter also matches the definition body", () => {
    const out = filterCodeResults(RESULTS, { codeText: "delta" });
    expect(out.map((r) => r.path)).toEqual(["src/foo/deep.ts"]);
  });

  test("excludeTestsGenerated drops results flagged by the backend", () => {
    const out = filterCodeResults(RESULTS, { excludeTestsGenerated: true });
    expect(out.some((r) => r.testOrGenerated)).toBe(false);
    expect(out).toHaveLength(3);
  });

  test("filters combine (AND)", () => {
    const out = filterCodeResults(RESULTS, { pathText: "src/foo", codeText: "delta" });
    expect(out.map((r) => r.path)).toEqual(["src/foo/deep.ts"]);
  });

  test("does not mutate the input array or its items", () => {
    const snapshot = JSON.stringify(RESULTS);
    filterCodeResults(RESULTS, { pathText: "foo", excludeTestsGenerated: true });
    expect(JSON.stringify(RESULTS)).toBe(snapshot);
  });
});
