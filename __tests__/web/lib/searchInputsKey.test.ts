import { describe, expect, test } from "bun:test";
import { searchInputsKey, type SearchInputs } from "@/web/lib/searchInputsKey.ts";

const BASE: SearchInputs = {
  mode: "general", query: "foo", caseSensitive: false, regex: false, symbolAction: "definition", side: "head",
};

describe("searchInputsKey", () => {
  test("is stable for identical inputs", () => {
    expect(searchInputsKey(BASE)).toBe(searchInputsKey({ ...BASE }));
  });

  /** [label, override that should change the key] */
  const CHANGES: Array<[string, Partial<SearchInputs>]> = [
    ["query", { query: "bar" }],
    ["mode", { mode: "symbol" }],
    ["caseSensitive", { caseSensitive: true }],
    ["regex", { regex: true }],
    ["symbolAction", { symbolAction: "usages" }],
    ["side", { side: "base" }],
  ];
  test.each(CHANGES)("changes when %s changes", (_label, override) => {
    expect(searchInputsKey({ ...BASE, ...override })).not.toBe(searchInputsKey(BASE));
  });

  test("trims the query so trailing whitespace does not count as a change", () => {
    expect(searchInputsKey({ ...BASE, query: "foo   " })).toBe(searchInputsKey(BASE));
  });
});
