import { describe, expect, test } from "bun:test";
import { navStackReducer, initNavStack, canGoBack, canGoForward, currentFrame, frameKey, type NavFrame } from "@/web/lib/navStack.ts";

const diff: NavFrame = { kind: "diff", path: "a.ts" };
const file: NavFrame = { kind: "file", path: "b.ts", sha: "abc", line: 10 };
const results: NavFrame = { kind: "results", op: "usages", term: "foo", side: "head", sha: "abc", scopeFile: "", results: [] };

describe("initNavStack", () => {
  test("seeds a single frame at index 0", () => {
    const s = initNavStack(diff);
    expect(s.stack).toEqual([diff]);
    expect(s.index).toBe(0);
    expect(currentFrame(s)).toEqual(diff);
    expect(canGoBack(s)).toBe(false);
    expect(canGoForward(s)).toBe(false);
  });
});

describe("navStackReducer push", () => {
  test("appends a frame and advances the index", () => {
    const s = navStackReducer(initNavStack(diff), { type: "push", frame: file });
    expect(s.stack).toEqual([diff, file]);
    expect(s.index).toBe(1);
    expect(currentFrame(s)).toEqual(file);
    expect(canGoBack(s)).toBe(true);
    expect(canGoForward(s)).toBe(false);
  });

  test("truncates forward history when pushing after going back", () => {
    let s = initNavStack(diff);
    s = navStackReducer(s, { type: "push", frame: file });
    s = navStackReducer(s, { type: "push", frame: results });
    s = navStackReducer(s, { type: "back" });
    // now at index 1 (file) with `results` ahead; pushing drops it
    s = navStackReducer(s, { type: "push", frame: diff });
    expect(s.stack).toEqual([diff, file, diff]);
    expect(s.index).toBe(2);
    expect(canGoForward(s)).toBe(false);
  });
});

describe("navStackReducer back/forward", () => {
  test("back moves toward the origin, clamped at 0", () => {
    let s = navStackReducer(initNavStack(diff), { type: "push", frame: file });
    s = navStackReducer(s, { type: "back" });
    expect(s.index).toBe(0);
    expect(currentFrame(s)).toEqual(diff);
    // clamp
    s = navStackReducer(s, { type: "back" });
    expect(s.index).toBe(0);
  });

  test("forward re-advances, clamped at the top", () => {
    let s = navStackReducer(initNavStack(diff), { type: "push", frame: file });
    s = navStackReducer(s, { type: "back" });
    s = navStackReducer(s, { type: "forward" });
    expect(s.index).toBe(1);
    expect(currentFrame(s)).toEqual(file);
    // clamp
    s = navStackReducer(s, { type: "forward" });
    expect(s.index).toBe(1);
  });
});

describe("frameKey", () => {
  /** Frames of the same identity share a key (so their mounted view + scroll persist). */
  test("diff frames key on path", () => {
    expect(frameKey(diff)).toBe(frameKey({ kind: "diff", path: "a.ts", anchorLine: 9 }));
    expect(frameKey(diff)).not.toBe(frameKey({ kind: "diff", path: "z.ts" }));
  });
  test("file frames key on path + sha", () => {
    expect(frameKey(file)).toBe(frameKey({ kind: "file", path: "b.ts", sha: "abc", line: 99 }));
    expect(frameKey(file)).not.toBe(frameKey({ kind: "file", path: "b.ts", sha: "def", line: 10 }));
  });
  test("results frames key on op + term + side + sha", () => {
    expect(frameKey(results)).not.toBe(frameKey({ ...results, term: "bar" }));
    expect(frameKey(results)).not.toBe(frameKey(diff));
  });
});

describe("navStackReducer immutability", () => {
  test("does not mutate the previous state or its stack", () => {
    const s0 = initNavStack(diff);
    const s1 = navStackReducer(s0, { type: "push", frame: file });
    expect(s0.stack).toEqual([diff]);
    expect(s0.index).toBe(0);
    expect(s1).not.toBe(s0);
    expect(s1.stack).not.toBe(s0.stack);
  });
});
