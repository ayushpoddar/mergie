import { describe, expect, test } from "bun:test";
import { findReferences } from "@/domain/references.ts";

const FILE = [
  "import { foo } from './x';", // 1
  "class Foo {", //                2
  "  bar() {", //                  3
  "    return foo();", //          4  <- real call
  "  }", //                        5
  "  fooBar() {}", //              6  <- substring, must NOT match `foo`
  "  baz() { foo; foo(); }", //    7  <- two occurrences, one line
];

describe("findReferences", () => {
  test("finds a single real reference within the span", () => {
    expect(findReferences(FILE, [3, 5], "foo")).toEqual([4]);
  });

  test("finds multiple reference lines within the span", () => {
    expect(findReferences(FILE, [1, 7], "foo")).toEqual([1, 4, 7]);
  });

  test("returns empty when the symbol never appears in the span", () => {
    expect(findReferences(FILE, [2, 3], "foo")).toEqual([]);
  });

  test("does not match a substring of a longer identifier", () => {
    // `fooBar` on line 6 must not count as a `foo` reference.
    expect(findReferences(FILE, [6, 6], "foo")).toEqual([]);
  });

  test("span is inclusive and 1-based", () => {
    expect(findReferences(FILE, [4, 4], "foo")).toEqual([4]);
  });

  test("clamps a span that runs past the end of the file", () => {
    expect(findReferences(FILE, [7, 999], "foo")).toEqual([7]);
  });
});

