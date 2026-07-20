import { describe, expect, test } from "bun:test";
import { filterPrs, type FilterablePr } from "@/web/lib/filterPrs.ts";

const PRS: FilterablePr[] = [
  { owner: "acme", repo: "api", number: 12, title: "Add export endpoint", author: "ayush" },
  { owner: "acme", repo: "web", number: 340, title: "Fix login redirect", author: "octo" },
  { owner: "globex", repo: "api", number: 5, title: "Bump deps", author: "ayush" },
];

/** [label, query, expected matching numbers] */
const CASES: Array<[string, string, number[]]> = [
  ["empty query matches all", "", [12, 340, 5]],
  ["blank/whitespace matches all", "   ", [12, 340, 5]],
  ["by owner", "globex", [5]],
  ["by repo", "web", [340]],
  ["by owner/repo", "acme/api", [12]],
  ["by title words, case-insensitive", "LOGIN", [340]],
  ["by author", "octo", [340]],
  ["by #number", "#340", [340]],
  ["by bare number", "12", [12]],
  ["no match", "nonesuch", []],
];

describe("filterPrs", () => {
  test.each(CASES)("%s", (_label, query, expected) => {
    expect(filterPrs(query, PRS).map((p) => p.number)).toEqual(expected);
  });

  test("does not mutate the input", () => {
    const copy = [...PRS];
    filterPrs("acme", PRS);
    expect(PRS).toEqual(copy);
  });
});
