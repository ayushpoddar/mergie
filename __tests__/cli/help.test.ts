import { describe, expect, test } from "bun:test";
import { commandHelp, formatVersion, generalHelp, HELP_TOPICS, parsePackageVersion } from "@/cli/help.ts";

describe("formatVersion", () => {
  test("prefixes the tool name", () => {
    expect(formatVersion("0.2.0")).toBe("mergie 0.2.0");
  });
});

describe("parsePackageVersion", () => {
  test("reads the version field", () => {
    expect(parsePackageVersion(JSON.stringify({ name: "mergie-cli", version: "1.2.3" }))).toBe("1.2.3");
  });

  /** JSON payloads with no usable string `version` field. */
  const INVALID: string[] = ['{"name":"x"}', "[]", '"str"', "42", "null", '{"version":1}'];
  test.each(INVALID)("throws when version is missing or non-string: %p", (json) => {
    expect(() => parsePackageVersion(json)).toThrow();
  });
});

describe("generalHelp", () => {
  const help: string = generalHelp();

  /** Lines the full help output must surface. */
  const EXPECTED: string[] = [
    "mergie — review GitHub pull requests",
    "Usage:",
    "mergie [--pr <url>] [--no-open]",
    "mergie reload",
    "mergie status",
    "mergie stop",
    "mergie help [command]",
    "mergie version",
    "Flags:",
    "--pr <url>",
    "--no-open",
    "-h, --help",
    "-v, --version",
  ];
  test.each(EXPECTED)("contains %p", (line) => {
    expect(help).toContain(line);
  });

  test("footer points to per-command help", () => {
    expect(help).toContain("mergie help <command>");
  });
});

describe("commandHelp", () => {
  test.each([...HELP_TOPICS])("returns a usage block for %p", (name) => {
    const text: string | undefined = commandHelp(name);
    expect(typeof text).toBe("string");
    expect(text).toContain("Usage:");
    expect(text).toContain("mergie");
  });

  test("returns undefined for an unknown command", () => {
    expect(commandHelp("frobnicate")).toBeUndefined();
  });
});
