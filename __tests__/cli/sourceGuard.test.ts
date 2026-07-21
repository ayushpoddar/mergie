import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { isBlockedSourceRun } from "@/cli/sourceGuard.ts";

const ROOT = "/repo";
const GIT_MARKER = join(ROOT, ".git");

/** Existence probe that only reports the `.git` marker as present when asked. */
const withGit = (present: boolean) => (path: string): boolean =>
  path === GIT_MARKER && present;

/** [name, env, isSourceCheckout, expectedBlocked] */
const CASES: ReadonlyArray<[string, Record<string, string | undefined>, boolean, boolean]> = [
  ["bare run inside a source checkout is blocked", {}, true, true],
  ["dev wrapper (MERGIE_DEV) is allowed in a source checkout", { MERGIE_DEV: "1" }, true, false],
  ["explicit override (MERGIE_FORCE) is allowed in a source checkout", { MERGIE_FORCE: "1" }, true, false],
  ["published install (no .git) is allowed", {}, false, false],
  ["published install with markers is allowed", { MERGIE_DEV: "1" }, false, false],
];

describe("isBlockedSourceRun", () => {
  test.each(CASES)("%s", (_name, env, isSourceCheckout, expected) => {
    expect(isBlockedSourceRun({ root: ROOT, env, exists: withGit(isSourceCheckout) })).toBe(expected);
  });
});
