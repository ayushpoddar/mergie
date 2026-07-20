import { describe, expect, test } from "bun:test";
import { resolvePort, DEFAULT_PORT } from "@/cli/constants.ts";

/** [MERGIE_PORT value, expected resolved port] */
const CASES: Array<[string | undefined, number]> = [
  [undefined, DEFAULT_PORT], // unset → default
  ["4518", 4518], // valid override
  ["1", 1], // low but valid
  ["65535", 65535], // top of the valid range
  ["0", DEFAULT_PORT], // out of range → default
  ["65536", DEFAULT_PORT], // out of range → default
  ["-5", DEFAULT_PORT], // negative → default
  ["abc", DEFAULT_PORT], // non-numeric → default
  ["", DEFAULT_PORT], // empty → default
  ["45.7", DEFAULT_PORT], // non-integer → default
];

describe("resolvePort", () => {
  test.each(CASES)("MERGIE_PORT=%p → %p", (value, expected) => {
    const env: Record<string, string | undefined> = value === undefined ? {} : { MERGIE_PORT: value };
    expect(resolvePort(env)).toBe(expected);
  });
});
