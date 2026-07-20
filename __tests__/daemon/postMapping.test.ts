import { describe, expect, test } from "bun:test";
import { commentAnchorHash } from "@/domain/hash.ts";
import type { DiffLine } from "@/domain/diff.ts";
import {
  hunkChangedSpan,
  locateLineComment,
  toPostInput,
} from "@/daemon/postMapping.ts";

const PATH = "src/foo.ts";

/** A small hand-built hunk exercising context, deletions, and additions. */
const LINES: DiffLine[] = [
  { kind: "ctx", oldNo: 10, newNo: 20, text: "const a = 1" },
  { kind: "del", oldNo: 11, text: "const b = 2" },
  { kind: "add", newNo: 21, text: "const b = 3" },
  { kind: "add", newNo: 22, text: "const c = 4" },
  { kind: "ctx", oldNo: 12, newNo: 23, text: "return a" },
];

describe("locateLineComment", () => {
  test("single RIGHT line resolves to its new-side number", () => {
    const anchor = commentAnchorHash(PATH, "RIGHT", "const c = 4");
    expect(locateLineComment(PATH, LINES, "RIGHT", 1, anchor)).toEqual({ startNo: 22, endNo: 22 });
  });

  test("multi-line RIGHT span resolves to first/last new-side numbers", () => {
    const anchor = commentAnchorHash(PATH, "RIGHT", "const b = 3\nconst c = 4");
    expect(locateLineComment(PATH, LINES, "RIGHT", 2, anchor)).toEqual({ startNo: 21, endNo: 22 });
  });

  test("LEFT line resolves to its old-side number", () => {
    const anchor = commentAnchorHash(PATH, "LEFT", "const b = 2");
    expect(locateLineComment(PATH, LINES, "LEFT", 1, anchor)).toEqual({ startNo: 11, endNo: 11 });
  });

  test("returns null when the text is not present on that side", () => {
    const anchor = commentAnchorHash(PATH, "RIGHT", "not here");
    expect(locateLineComment(PATH, LINES, "RIGHT", 1, anchor)).toBeNull();
  });
});

describe("hunkChangedSpan", () => {
  test("RIGHT span covers the added lines", () => {
    expect(hunkChangedSpan(LINES, "RIGHT")).toEqual({ startNo: 21, endNo: 22 });
  });

  test("LEFT span covers the deleted lines", () => {
    expect(hunkChangedSpan(LINES, "LEFT")).toEqual({ startNo: 11, endNo: 11 });
  });

  test("returns null when the side has no changed lines", () => {
    const ctxOnly: DiffLine[] = [{ kind: "ctx", oldNo: 1, newNo: 1, text: "x" }];
    expect(hunkChangedSpan(ctxOnly, "RIGHT")).toBeNull();
  });
});

describe("toPostInput", () => {
  test("single line omits start_line", () => {
    expect(toPostInput({
      path: PATH, side: "RIGHT", body: "hi", commitId: "abc", startNo: 22, endNo: 22,
    })).toEqual({ body: "hi", commitId: "abc", path: PATH, side: "RIGHT", line: 22 });
  });

  test("multi-line sets start_line to the first line", () => {
    expect(toPostInput({
      path: PATH, side: "RIGHT", body: "hi", commitId: "abc", startNo: 21, endNo: 22,
    })).toEqual({ body: "hi", commitId: "abc", path: PATH, side: "RIGHT", line: 22, startLine: 21 });
  });
});
