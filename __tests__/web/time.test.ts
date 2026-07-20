import { describe, expect, test } from "bun:test";
import { formatCommitTime } from "@/web/lib/time.ts";

/** [iso, expected] */
const CASES: Array<[string, string]> = [
  ["2026-07-10T09:54:29Z", "2026-07-10 09:54"],
  ["2026-07-11T10:00:00Z", "2026-07-11 10:00"],
  ["", ""],
  ["not-a-date", ""],
];

describe("formatCommitTime", () => {
  test.each(CASES)("%p -> %p", (iso, expected) => {
    expect(formatCommitTime(iso)).toBe(expected);
  });
});
