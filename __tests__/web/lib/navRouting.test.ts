import { describe, expect, test } from "bun:test";
import { frameForLookup } from "@/web/lib/navRouting.ts";
import type { CodeResult } from "@/services/symbols.ts";

const def = (path: string, line: number): CodeResult => ({
  path, line, before: [], matched: "x", after: [], kind: "definition", testOrGenerated: false,
});

describe("frameForLookup", () => {
  test("usages always pushes a results frame carrying its scope file", () => {
    const f = frameForLookup("usages", "foo", "head", "sha1", [def("a.ts", 1), def("a.ts", 2)], "a.ts");
    expect(f.kind).toBe("results");
    if (f.kind === "results") expect(f.scopeFile).toBe("a.ts");
  });

  test("search always pushes a results frame", () => {
    const f = frameForLookup("search", "foo", "head", "sha1", [def("a.ts", 1)], "");
    expect(f.kind).toBe("results");
  });

  test("multi-result definition pushes a results frame", () => {
    const f = frameForLookup("definition", "foo", "head", "sha1", [def("a.ts", 1), def("b.ts", 2)], "");
    expect(f.kind).toBe("results");
  });

  test("unscoped single-result definition jumps straight to a file frame", () => {
    const f = frameForLookup("definition", "foo", "head", "sha1", [def("a.ts", 42)], "");
    expect(f).toEqual({ kind: "file", path: "a.ts", sha: "sha1", line: 42 });
  });

  test("scoped single-result definition stays a results frame (so the scope chip + broaden show)", () => {
    const f = frameForLookup("definition", "foo", "head", "sha1", [def("a.ts", 42)], "a.ts");
    expect(f.kind).toBe("results");
    if (f.kind === "results") expect(f.scopeFile).toBe("a.ts");
  });

  test("empty definition falls back to a results frame (shows the empty state)", () => {
    const f = frameForLookup("definition", "foo", "head", "sha1", [], "");
    expect(f.kind).toBe("results");
  });
});
