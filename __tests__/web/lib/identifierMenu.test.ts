import { describe, expect, test } from "bun:test";
import { isIdentifier, fileFromSectionId, sideForLineKind, parseDataSide } from "@/web/lib/identifierMenu.ts";
import type { SearchSide } from "@/web/state/useCodeSearch.ts";
import type { DiffLine } from "@/domain/diff.ts";

/** [label, term, expected] */
const identifierCases: [string, string, boolean][] = [
  ["simple name", "foo", true],
  ["camelCase", "bulkOperationService", true],
  ["leading underscore", "_private", true],
  ["dollar prefix", "$el", true],
  ["digits after letter", "sha256", true],
  ["empty string", "", false],
  ["leading digit", "1foo", false],
  ["dotted access", "a.b", false],
  ["with space", "foo bar", false],
  ["call expression", "foo()", false],
  ["hyphenated", "foo-bar", false],
];

describe("isIdentifier", () => {
  test.each(identifierCases)("%s", (_label, term, expected) => {
    expect(isIdentifier(term)).toBe(expected);
  });
});

/** [label, sectionId, expected] */
const sectionCases: [string, string, string][] = [
  ["strips the file- prefix", "file-src/services/foo.ts", "src/services/foo.ts"],
  ["path containing 'file-' later is preserved", "file-src/file-utils.ts", "src/file-utils.ts"],
  ["non-file id yields empty", "hunk-abc", ""],
  ["empty id yields empty", "", ""],
];

describe("fileFromSectionId", () => {
  test.each(sectionCases)("%s", (_label, id, expected) => {
    expect(fileFromSectionId(id)).toBe(expected);
  });
});

/** [label, kind, expected] — a deleted line lives on base, everything else on head. */
const lineKindCases: [string, DiffLine["kind"], SearchSide][] = [
  ["deleted line → base", "del", "base"],
  ["added line → head", "add", "head"],
  ["context line → head", "ctx", "head"],
];

describe("sideForLineKind", () => {
  test.each(lineKindCases)("%s", (_label, kind, expected) => {
    expect(sideForLineKind(kind)).toBe(expected);
  });
});

/** [label, value, expected] — only an explicit "base" attribute means base. */
const dataSideCases: [string, string | null, SearchSide][] = [
  ["base attribute", "base", "base"],
  ["head attribute", "head", "head"],
  ["missing attribute → head", null, "head"],
  ["unknown value → head", "left", "head"],
];

describe("parseDataSide", () => {
  test.each(dataSideCases)("%s", (_label, value, expected) => {
    expect(parseDataSide(value)).toBe(expected);
  });
});
