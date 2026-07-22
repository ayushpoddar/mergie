import { describe, expect, test } from "bun:test";
import {
  bunVersionSatisfies,
  bunOutdatedMessage,
  runHardChecks,
  runSoftChecks,
  GH_MISSING,
  GH_UNAUTHENTICATED,
  RG_MISSING,
  SEM_MISSING,
  CLAUDE_MISSING,
  type CommandProbe,
} from "@/cli/preflight.ts";

/** A fake probe: `present` lists tools on PATH; `ghAuthCode` is `gh auth status`'s exit. */
function fakeProbe(present: string[], ghAuthCode = 0): CommandProbe {
  const set = new Set(present);
  return {
    exists: (cmd) => set.has(cmd),
    run: async (cmd, args) => {
      if (cmd === "gh" && args[0] === "auth") return { code: ghAuthCode, stdout: "" };
      return { code: 0, stdout: "" };
    },
  };
}

/** [version, satisfies?] against the >= 1.2.0 minimum. */
const VERSION_CASES: ReadonlyArray<[string, boolean]> = [
  ["1.2.0", true],
  ["1.2.5", true],
  ["1.3.4", true],
  ["2.0.0", true],
  ["1.2", true],
  ["1.2.0-canary.20240101", true],
  ["1.1.9", false],
  ["1.0.0", false],
  ["0.9.9", false],
  ["", false],
  ["garbage", false],
];

describe("bunVersionSatisfies", () => {
  test.each(VERSION_CASES)("%s -> %p", (version, expected) => {
    expect(bunVersionSatisfies(version)).toBe(expected);
  });
});

describe("runHardChecks", () => {
  test("all good -> no errors", async () => {
    expect(await runHardChecks(fakeProbe(["gh"]), "1.3.4")).toEqual([]);
  });

  test("outdated bun -> upgrade message", async () => {
    expect(await runHardChecks(fakeProbe(["gh"]), "1.1.0")).toEqual([bunOutdatedMessage("1.1.0")]);
  });

  test("gh missing -> install message", async () => {
    expect(await runHardChecks(fakeProbe([]), "1.3.4")).toEqual([GH_MISSING]);
  });

  test("gh present but unauthenticated -> auth message", async () => {
    expect(await runHardChecks(fakeProbe(["gh"], 1), "1.3.4")).toEqual([GH_UNAUTHENTICATED]);
  });

  test("multiple failures accumulate", async () => {
    const errors = await runHardChecks(fakeProbe([]), "1.1.0");
    expect(errors).toEqual([bunOutdatedMessage("1.1.0"), GH_MISSING]);
  });
});

describe("runSoftChecks", () => {
  test("all present -> no warnings", async () => {
    expect(await runSoftChecks(fakeProbe(["rg", "sem", "claude"]))).toEqual([]);
  });

  test("claude missing -> claude warning", async () => {
    expect(await runSoftChecks(fakeProbe(["rg", "sem"]))).toEqual([CLAUDE_MISSING]);
  });

  test("all missing -> all warnings in order", async () => {
    expect(await runSoftChecks(fakeProbe([]))).toEqual([RG_MISSING, SEM_MISSING, CLAUDE_MISSING]);
  });
});
