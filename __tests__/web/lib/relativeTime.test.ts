import { describe, expect, test } from "bun:test";
import { relativeTime } from "@/web/lib/relativeTime.ts";

/** A fixed "now" for deterministic assertions. */
const NOW = Date.parse("2026-07-20T12:00:00Z");
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const cases: Array<[string, string, string]> = [
  ["under a minute → just now", ago(10 * SEC), "just now"],
  ["minutes", ago(5 * MIN), "5m ago"],
  ["one hour", ago(1 * HOUR), "1h ago"],
  ["hours", ago(6 * HOUR), "6h ago"],
  ["days", ago(3 * DAY), "3d ago"],
  ["weeks fall back to days", ago(10 * DAY), "10d ago"],
  ["months", ago(60 * DAY), "2mo ago"],
  ["years", ago(400 * DAY), "1y ago"],
];

describe("relativeTime", () => {
  test.each(cases)("%s", (_label, iso, expected) => {
    expect(relativeTime(iso, NOW)).toBe(expected);
  });

  test("empty or unparseable input returns empty string", () => {
    expect(relativeTime("", NOW)).toBe("");
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });

  test("a future timestamp clamps to just now", () => {
    expect(relativeTime(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe("just now");
  });
});
