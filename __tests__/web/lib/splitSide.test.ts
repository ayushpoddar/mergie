import { describe, expect, test } from "bun:test";
import { splitSideIsEmpty } from "@/web/lib/splitSide.ts";
import type { SplitRow } from "@/daemon/splitView.ts";

const ctx: SplitRow["left"] = { no: 1, text: "a", kind: "ctx" };
const add: SplitRow["right"] = { no: 1, text: "b", kind: "add" };
const empty: SplitRow["left"] = { no: null, text: "", kind: "empty" };

/** An added file: every left (base) cell is empty padding. */
const addedFile: SplitRow[] = [
  { left: empty, right: add },
  { left: empty, right: add },
];
/** A deleted file: every right (head) cell is empty padding. */
const deletedFile: SplitRow[] = [
  { left: { no: 1, text: "a", kind: "del" }, right: empty },
];
/** A modified file: both sides carry content somewhere. */
const modifiedFile: SplitRow[] = [{ left: ctx, right: { no: 1, text: "a", kind: "ctx" } }];

describe("splitSideIsEmpty", () => {
  test("base side empty for an added file", () => {
    expect(splitSideIsEmpty(addedFile, "left")).toBe(true);
    expect(splitSideIsEmpty(addedFile, "right")).toBe(false);
  });
  test("head side empty for a deleted file", () => {
    expect(splitSideIsEmpty(deletedFile, "right")).toBe(true);
    expect(splitSideIsEmpty(deletedFile, "left")).toBe(false);
  });
  test("neither side empty for a modified file", () => {
    expect(splitSideIsEmpty(modifiedFile, "left")).toBe(false);
    expect(splitSideIsEmpty(modifiedFile, "right")).toBe(false);
  });
  test("empty rows list is not treated as an empty side (nothing to place)", () => {
    expect(splitSideIsEmpty([], "left")).toBe(false);
  });
});
