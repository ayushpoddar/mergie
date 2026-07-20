import { describe, expect, test } from "bun:test";
import { nextRailTab, RAIL_TABS, type RailTab } from "@/web/lib/railState.ts";

/** [current, clicked, expected] tuples for nextRailTab. */
const cases: ReadonlyArray<[RailTab | null, RailTab, RailTab | null]> = [
  // Opening from collapsed activates the clicked tab.
  [null, "comments", "comments"],
  [null, "reviews", "reviews"],
  [null, "description", "description"],
  [null, "search", "search"],
  // Clicking the active tab again collapses.
  ["comments", "comments", null],
  ["reviews", "reviews", null],
  ["description", "description", null],
  ["search", "search", null],
  // Clicking a different tab switches without collapsing.
  ["comments", "reviews", "reviews"],
  ["reviews", "description", "description"],
  ["description", "comments", "comments"],
  ["comments", "search", "search"],
  ["search", "comments", "comments"],
];

describe("nextRailTab", () => {
  test.each(cases)("current=%p, clicked=%p -> %p", (current, clicked, expected) => {
    expect(nextRailTab(current, clicked)).toBe(expected);
  });
});

describe("RAIL_TABS", () => {
  test("lists the four tabs in rail order", () => {
    expect(RAIL_TABS).toEqual(["comments", "reviews", "description", "search"]);
  });
});
