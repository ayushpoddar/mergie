import { describe, expect, test } from "bun:test";
import { dedupeResults } from "@/web/lib/dedupeResults.ts";
import type { CodeResult } from "@/services/symbols.ts";

/** Build a minimal CodeResult for tests. */
function make(over: Partial<CodeResult>): CodeResult {
  return {
    path: "a.ts",
    line: 1,
    before: [],
    matched: "x",
    after: [],
    kind: "usage",
    testOrGenerated: false,
    ...over,
  };
}

describe("dedupeResults", () => {
  test("returns an empty array unchanged", () => {
    expect(dedupeResults([])).toEqual([]);
  });

  test("keeps distinct (path, line) results", () => {
    const input = [make({ path: "a.ts", line: 1 }), make({ path: "a.ts", line: 2 })];
    expect(dedupeResults(input)).toHaveLength(2);
  });

  test("keeps same line in different files", () => {
    const input = [make({ path: "a.ts", line: 5 }), make({ path: "b.ts", line: 5 })];
    expect(dedupeResults(input)).toHaveLength(2);
  });

  test("merges duplicate (path, line) into one item", () => {
    const input = [
      make({ path: "a.ts", line: 138, scope: "BulkOperationService" }),
      make({ path: "a.ts", line: 138, scope: "classifyBulkOperationState" }),
    ];
    const out = dedupeResults(input);
    expect(out).toHaveLength(1);
    expect(out[0]?.scope).toBe("BulkOperationService, classifyBulkOperationState");
  });

  test("does not duplicate a repeated scope label", () => {
    const input = [
      make({ path: "a.ts", line: 10, scope: "Foo" }),
      make({ path: "a.ts", line: 10, scope: "Foo" }),
    ];
    expect(dedupeResults(input)[0]?.scope).toBe("Foo");
  });

  test("keeps the first result's fields; only scopes combine", () => {
    const input = [
      make({ path: "a.ts", line: 3, matched: "first", scope: "A" }),
      make({ path: "a.ts", line: 3, matched: "second", scope: "B" }),
    ];
    const out = dedupeResults(input);
    expect(out[0]?.matched).toBe("first");
    expect(out[0]?.scope).toBe("A, B");
  });

  test("omits scope when no duplicate carries one", () => {
    const input = [make({ path: "a.ts", line: 1, scope: undefined }), make({ path: "a.ts", line: 1, scope: undefined })];
    expect(dedupeResults(input)[0]?.scope).toBeUndefined();
  });

  test("preserves first-seen order", () => {
    const input = [make({ line: 9 }), make({ line: 4 }), make({ line: 9 })];
    expect(dedupeResults(input).map((r) => r.line)).toEqual([9, 4]);
  });

  test("does not mutate the input array or its items", () => {
    const item = make({ path: "a.ts", line: 1, scope: "A" });
    const input = [item, make({ path: "a.ts", line: 1, scope: "B" })];
    dedupeResults(input);
    expect(item.scope).toBe("A");
    expect(input).toHaveLength(2);
  });
});
