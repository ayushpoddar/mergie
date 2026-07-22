import { describe, expect, test } from "bun:test";
import { parseArgs, type Command } from "@/cli/args.ts";

/** [argv, expected command] */
const VALID: Array<[string[], Command]> = [
  // No arguments → open the home picker with no PR selected.
  [[], { kind: "open", noOpen: false }],
  [["--pr", "https://github.com/o/r/pull/1"], { kind: "review", url: "https://github.com/o/r/pull/1", noOpen: false }],
  [["--pr=https://github.com/o/r/pull/2"], { kind: "review", url: "https://github.com/o/r/pull/2", noOpen: false }],
  [["stop"], { kind: "stop" }],
  [["status"], { kind: "status" }],
  [["reload"], { kind: "reload", noOpen: false }],
  // --no-open suppresses the browser tab for every open flow.
  [["--no-open"], { kind: "open", noOpen: true }],
  [["--pr", "https://github.com/o/r/pull/3", "--no-open"], { kind: "review", url: "https://github.com/o/r/pull/3", noOpen: true }],
  [["--no-open", "--pr", "https://github.com/o/r/pull/4"], { kind: "review", url: "https://github.com/o/r/pull/4", noOpen: true }],
  [["reload", "--no-open"], { kind: "reload", noOpen: true }],
  // version, in every spelling.
  [["version"], { kind: "version" }],
  [["-v"], { kind: "version" }],
  [["--version"], { kind: "version" }],
  // help, general.
  [["help"], { kind: "help" }],
  [["-h"], { kind: "help" }],
  [["--help"], { kind: "help" }],
  // help for a specific command, via subcommand or flag form.
  [["help", "stop"], { kind: "help", command: "stop" }],
  [["help", "reload"], { kind: "help", command: "reload" }],
  [["stop", "--help"], { kind: "help", command: "stop" }],
  [["reload", "-h"], { kind: "help", command: "reload" }],
  // version/help short-circuit and win over other arguments; help beats version.
  [["--pr", "https://github.com/o/r/pull/5", "-v"], { kind: "version" }],
  [["-v", "--help"], { kind: "help" }],
];

describe("parseArgs", () => {
  test.each(VALID)("%p", (argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected);
  });

  test("rejects --pr without a value", () => {
    expect(() => parseArgs(["--pr"])).toThrow();
  });

  test("rejects unknown commands", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow();
  });

  test("rejects --no-open combined with stop", () => {
    expect(() => parseArgs(["stop", "--no-open"])).toThrow();
  });

  test("rejects help for an unknown command", () => {
    expect(() => parseArgs(["help", "frobnicate"])).toThrow();
  });
});
