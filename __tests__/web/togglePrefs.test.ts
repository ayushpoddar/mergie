import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TOGGLES,
  readToggles,
  writeToggles,
  toggleStorageKey,
  hideWhitespaceStorageKey,
  type ToggleStore,
} from "@/web/lib/togglePrefs.ts";
import type { VisibilityToggles } from "@/web/lib/visibleFiles.ts";

/** An in-memory {@link ToggleStore} for tests. */
function memStore(seed: Record<string, string> = {}): ToggleStore {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
  };
}

describe("toggleStorageKey", () => {
  test("is namespaced per PR id", () => {
    expect(toggleStorageKey("pr_o_r_1")).toBe("mergie:toggles:pr_o_r_1");
    expect(toggleStorageKey("pr_o_r_2")).not.toBe(toggleStorageKey("pr_o_r_1"));
  });
});

describe("hideWhitespaceStorageKey", () => {
  test("is namespaced per PR id and distinct from the toggles key", () => {
    expect(hideWhitespaceStorageKey("pr_o_r_1")).toBe("mergie:hideWhitespace:pr_o_r_1");
    expect(hideWhitespaceStorageKey("pr_o_r_2")).not.toBe(hideWhitespaceStorageKey("pr_o_r_1"));
    expect(hideWhitespaceStorageKey("pr_o_r_1")).not.toBe(toggleStorageKey("pr_o_r_1"));
  });
});

describe("readToggles", () => {
  test("returns defaults (all off) when nothing is stored", () => {
    expect(readToggles(memStore(), "pr")).toEqual(DEFAULT_TOGGLES);
    expect(DEFAULT_TOGGLES).toEqual({ hideViewedHunks: false, hideViewedFiles: false, hideLockFiles: false });
  });

  test("returns defaults when the stored value is malformed JSON", () => {
    expect(readToggles(memStore({ "mergie:toggles:pr": "{not json" }), "pr")).toEqual(DEFAULT_TOGGLES);
  });

  test("restores a previously written value", () => {
    const store = memStore();
    const toggles: VisibilityToggles = { hideViewedHunks: true, hideViewedFiles: false, hideLockFiles: true };
    writeToggles(store, "pr", toggles);
    expect(readToggles(store, "pr")).toEqual(toggles);
  });

  test("coerces missing/extra keys to booleans against the default shape", () => {
    const store = memStore({ "mergie:toggles:pr": JSON.stringify({ hideViewedHunks: true, bogus: 1 }) });
    expect(readToggles(store, "pr")).toEqual({ hideViewedHunks: true, hideViewedFiles: false, hideLockFiles: false });
  });

  test("keeps distinct PRs independent", () => {
    const store = memStore();
    writeToggles(store, "a", { hideViewedHunks: true, hideViewedFiles: true, hideLockFiles: true });
    expect(readToggles(store, "b")).toEqual(DEFAULT_TOGGLES);
  });
});
