import { describe, expect, test } from "bun:test";
import { applyDiffMarks } from "@/web/lib/diffMarks.ts";
import type { CharRange } from "@/domain/diff.ts";

const MARK = '<mark class="diff-word">';

describe("applyDiffMarks", () => {
  test("returns the html untouched when there are no ranges", () => {
    expect(applyDiffMarks("<span>const</span> x", [])).toBe("<span>const</span> x");
  });

  test("wraps a plain-text range", () => {
    // "const x" — mark the trailing "x".
    expect(applyDiffMarks("const x", [{ start: 6, end: 7 }])).toBe(`const ${MARK}x</mark>`);
  });

  test("counts an HTML entity as a single plain-text character", () => {
    // Plain text is "a < b"; mark the "<" which is encoded as &lt;.
    expect(applyDiffMarks("a &lt; b", [{ start: 2, end: 3 }])).toBe(`a ${MARK}&lt;</mark> b`);
  });

  test("closes and reopens the mark across a syntax-highlight span boundary", () => {
    // Plain "const x"; range covers "st x", spanning the </span> boundary so the
    // mark must not cross the tag (valid nesting).
    const html = '<span class="hljs-keyword">const</span> x';
    expect(applyDiffMarks(html, [{ start: 3, end: 7 }])).toBe(
      `<span class="hljs-keyword">con${MARK}st</mark></span>${MARK} x</mark>`,
    );
  });

  test("handles multiple disjoint ranges", () => {
    // "const gamma = 1;" style — mark "gamma" and "1".
    const ranges: CharRange[] = [{ start: 6, end: 11 }, { start: 14, end: 15 }];
    expect(applyDiffMarks("const gamma = 1;", ranges)).toBe(
      `const ${MARK}gamma</mark> = ${MARK}1</mark>;`,
    );
  });

  test("clamps ranges that run past the end of the text", () => {
    expect(applyDiffMarks("abc", [{ start: 1, end: 99 }])).toBe(`a${MARK}bc</mark>`);
  });
});
