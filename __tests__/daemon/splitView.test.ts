import { describe, expect, test } from "bun:test";
import { buildSplitRows } from "@/daemon/splitView.ts";
import type { DiffLine } from "@/domain/diff.ts";

const ctx = (oldNo: number, newNo: number, text: string): DiffLine => ({ kind: "ctx", oldNo, newNo, text });
const del = (oldNo: number, text: string): DiffLine => ({ kind: "del", oldNo, newNo: undefined, text });
const add = (newNo: number, text: string): DiffLine => ({ kind: "add", oldNo: undefined, newNo, text });

describe("buildSplitRows", () => {
  test("context lines appear identically on both sides", () => {
    const rows = buildSplitRows([ctx(1, 1, "a"), ctx(2, 2, "b")]);
    expect(rows).toEqual([
      { left: { no: 1, text: "a", kind: "ctx" }, right: { no: 1, text: "a", kind: "ctx" } },
      { left: { no: 2, text: "b", kind: "ctx" }, right: { no: 2, text: "b", kind: "ctx" } },
    ]);
  });

  test("a balanced change block pairs del (left) with add (right)", () => {
    const rows = buildSplitRows([ctx(1, 1, "a"), del(2, "old"), add(2, "new"), ctx(3, 3, "c")]);
    expect(rows[1]).toEqual({
      left: { no: 2, text: "old", kind: "del" },
      right: { no: 2, text: "new", kind: "add" },
    });
  });

  test("unbalanced changes pad the shorter side with empty cells", () => {
    const rows = buildSplitRows([del(1, "x"), add(1, "y"), add(2, "z")]);
    expect(rows).toEqual([
      { left: { no: 1, text: "x", kind: "del" }, right: { no: 1, text: "y", kind: "add" } },
      { left: { no: null, text: "", kind: "empty" }, right: { no: 2, text: "z", kind: "add" } },
    ]);
  });

  test("pure additions (new file) leave the left side empty", () => {
    const rows = buildSplitRows([add(1, "first"), add(2, "second")]);
    expect(rows.every((r) => r.left.kind === "empty")).toBe(true);
    expect(rows.map((r) => r.right.text)).toEqual(["first", "second"]);
  });
});
