import { describe, expect, test } from "bun:test";
import { commentAnchorHash, hunkHash } from "@/domain/hash.ts";

const HEX64 = /^[0-9a-f]{64}$/;

describe("hunkHash", () => {
  test("is a 64-char lowercase hex digest", () => {
    expect(hunkHash("src/a.ts", "@@ -1 +1 @@\n-a\n+b")).toMatch(HEX64);
  });
  test("is deterministic for identical inputs", () => {
    expect(hunkHash("src/a.ts", "body")).toBe(hunkHash("src/a.ts", "body"));
  });
  test("differs when the hunk body differs", () => {
    expect(hunkHash("src/a.ts", "body1")).not.toBe(hunkHash("src/a.ts", "body2"));
  });
  test("differs when the file path differs (same body)", () => {
    expect(hunkHash("src/a.ts", "body")).not.toBe(hunkHash("src/b.ts", "body"));
  });
});

describe("commentAnchorHash", () => {
  test("is a 64-char lowercase hex digest", () => {
    expect(commentAnchorHash("src/a.ts", "RIGHT", "const x = 1")).toMatch(HEX64);
  });
  test("is deterministic", () => {
    expect(commentAnchorHash("src/a.ts", "RIGHT", "line")).toBe(
      commentAnchorHash("src/a.ts", "RIGHT", "line"),
    );
  });
  test("differs by side", () => {
    expect(commentAnchorHash("src/a.ts", "LEFT", "line")).not.toBe(
      commentAnchorHash("src/a.ts", "RIGHT", "line"),
    );
  });
  test("differs by path and by line text", () => {
    expect(commentAnchorHash("src/a.ts", "RIGHT", "line")).not.toBe(
      commentAnchorHash("src/b.ts", "RIGHT", "line"),
    );
    expect(commentAnchorHash("src/a.ts", "RIGHT", "l1")).not.toBe(
      commentAnchorHash("src/a.ts", "RIGHT", "l2"),
    );
  });
});
