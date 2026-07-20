import { describe, expect, test } from "bun:test";
import { readFlag, writeFlag, type FlagStore } from "@/web/lib/persistedFlag.ts";

/** An in-memory {@link FlagStore} for tests. */
function memStore(seed: Record<string, string> = {}): FlagStore {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

const KEY = "mergie:leftSidebarCollapsed";

describe("readFlag", () => {
  /** [label, storedValue|absent, fallback, expected] */
  const cases: [string, string | null, boolean, boolean][] = [
    ["absent → fallback false", null, false, false],
    ["absent → fallback true", null, true, true],
    ["stored 'true' → true", "true", false, true],
    ["stored 'false' → false", "false", true, false],
    ["malformed → fallback", "yes", true, true],
    ["malformed → fallback false", "1", false, false],
  ];
  test.each(cases)("%s", (_label, stored, fallback, expected) => {
    const store = stored === null ? memStore() : memStore({ [KEY]: stored });
    expect(readFlag(store, KEY, fallback)).toBe(expected);
  });
});

describe("writeFlag / round-trip", () => {
  test("writes a boolean readable back at the same key", () => {
    const store = memStore();
    writeFlag(store, KEY, true);
    expect(readFlag(store, KEY, false)).toBe(true);
    writeFlag(store, KEY, false);
    expect(readFlag(store, KEY, true)).toBe(false);
  });
});
