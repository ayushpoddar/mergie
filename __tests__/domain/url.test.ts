import { describe, expect, test } from "bun:test";
import { parsePrUrl, type PullRequestRef } from "@/domain/url.ts";

/** Valid inputs → expected parsed ref. */
const VALID: Array<[string, PullRequestRef]> = [
  [
    "https://github.com/withastro/astro/pull/17360/changes",
    { host: "github.com", owner: "withastro", repo: "astro", number: 17360 },
  ],
  [
    "https://github.com/withastro/astro/pull/17360",
    { host: "github.com", owner: "withastro", repo: "astro", number: 17360 },
  ],
  [
    "https://github.com/withastro/astro/pull/17360/files",
    { host: "github.com", owner: "withastro", repo: "astro", number: 17360 },
  ],
  [
    "https://github.com/o/r/pull/1#issuecomment-99",
    { host: "github.com", owner: "o", repo: "r", number: 1 },
  ],
  [
    "http://github.com/o/r/pull/7/",
    { host: "github.com", owner: "o", repo: "r", number: 7 },
  ],
];

/** Inputs that must be rejected. */
const INVALID: string[] = [
  "https://github.com/withastro/astro",
  "https://github.com/withastro/astro/pull/",
  "https://github.com/withastro/astro/pull/abc",
  "https://github.com/withastro/astro/issues/17360",
  "not a url",
  "",
];

describe("parsePrUrl", () => {
  test.each(VALID)("parses %s", (input, expected) => {
    expect(parsePrUrl(input)).toEqual(expected);
  });

  test.each(INVALID)("rejects %s", (input) => {
    expect(() => parsePrUrl(input)).toThrow();
  });
});
