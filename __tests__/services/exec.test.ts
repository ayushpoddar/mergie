import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { bunRunner } from "@/services/exec.ts";

describe("bunRunner", () => {
  test("captures stdout and a zero exit code", async () => {
    const r = await bunRunner.run("printf", ["hello"]);
    expect(r.stdout).toBe("hello");
    expect(r.exitCode).toBe(0);
  });

  test("captures stderr and a non-zero exit code", async () => {
    const r = await bunRunner.run("sh", ["-c", "echo boom >&2; exit 3"]);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("boom");
  });

  test("feeds stdin input", async () => {
    const r = await bunRunner.run("cat", [], { input: "piped" });
    expect(r.stdout).toBe("piped");
  });

  test("runs in the given cwd", async () => {
    const r = await bunRunner.run("pwd", [], { cwd: "/tmp" });
    expect(r.stdout.trim()).toBe(realpathSync("/tmp"));
  });
});
