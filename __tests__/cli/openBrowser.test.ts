import { describe, expect, test } from "bun:test";
import type { CommandResult, CommandRunner } from "@/services/exec.ts";
import { openBrowser } from "@/cli/openBrowser.ts";

function recordingRunner(): { runner: CommandRunner; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const result: CommandResult = { stdout: "", stderr: "", exitCode: 0 };
  return { calls, runner: { run: async (cmd, args) => { calls.push({ cmd, args }); return result; } } };
}

describe("openBrowser", () => {
  test("invokes the macOS `open` command with the URL", async () => {
    const { runner, calls } = recordingRunner();
    await openBrowser("http://localhost:4517/?pr=x", runner);
    expect(calls[0]).toEqual({ cmd: "open", args: ["http://localhost:4517/?pr=x"] });
  });
});
