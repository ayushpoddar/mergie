import { describe, expect, test } from "bun:test";
import { buildWebUi } from "@/daemon/buildUi.ts";
import type { CommandResult, CommandRunner, RunOptions } from "@/services/exec.ts";

/** A runner that records its single invocation and returns a canned result. */
function fakeRunner(result: CommandResult): {
  runner: CommandRunner;
  calls: Array<{ cmd: string; args: string[]; opts?: RunOptions }>;
} {
  const calls: Array<{ cmd: string; args: string[]; opts?: RunOptions }> = [];
  const runner: CommandRunner = {
    run: (cmd, args, opts) => {
      calls.push({ cmd, args, opts });
      return Promise.resolve(result);
    },
  };
  return { runner, calls };
}

const OK: CommandResult = { stdout: "built", stderr: "", exitCode: 0 };
const FAIL: CommandResult = { stdout: "", stderr: "boom", exitCode: 1 };

describe("buildWebUi", () => {
  test("runs the build:web script in the given root when the toolchain is present", async () => {
    const { runner, calls } = fakeRunner(OK);
    const ok: boolean = await buildWebUi({ runner, root: "/repo/root", log: () => {}, hasBuildTooling: () => true });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe("bun");
    expect(calls[0]!.args).toEqual(["run", "build:web"]);
    expect(calls[0]!.opts?.cwd).toBe("/repo/root");
  });

  test("returns false and does not throw when the build fails", async () => {
    const { runner } = fakeRunner(FAIL);
    const logs: string[] = [];
    const ok: boolean = await buildWebUi({ runner, root: "/repo/root", log: (m) => logs.push(m), hasBuildTooling: () => true });
    expect(ok).toBe(false);
    expect(logs.join("\n")).toContain("failed");
  });

  test("skips the build and serves the bundled UI when the toolchain is absent", async () => {
    const { runner, calls } = fakeRunner(OK);
    const logs: string[] = [];
    const ok: boolean = await buildWebUi({ runner, root: "/repo/root", log: (m) => logs.push(m), hasBuildTooling: () => false });
    expect(ok).toBe(true);
    expect(calls).toHaveLength(0); // build never invoked
    expect(logs.join("\n")).toContain("prebuilt");
  });
});
