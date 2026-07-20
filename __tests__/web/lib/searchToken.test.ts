import { describe, expect, test } from "bun:test";
import { nextToken, isCurrent } from "@/web/lib/searchToken.ts";

describe("nextToken", () => {
  test("starts issuing from 1", () => {
    expect(nextToken(0)).toBe(1);
  });

  test("increments monotonically", () => {
    expect(nextToken(41)).toBe(42);
  });
});

describe("isCurrent", () => {
  test("a result tagged with the latest token is current", () => {
    expect(isCurrent(5, 5)).toBe(true);
  });

  test("a result from a superseded (older) request is stale", () => {
    expect(isCurrent(4, 5)).toBe(false);
  });

  test("a result tagged with a future token is not applied", () => {
    expect(isCurrent(6, 5)).toBe(false);
  });
});
