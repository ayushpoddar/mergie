import { bunRunner, type CommandRunner } from "@/services/exec.ts";

/** Dependencies for building the web UI. */
export interface BuildUiDeps {
  /** Command runner to execute the build (defaults to the real Bun-backed runner). */
  runner?: CommandRunner;
  /** Checkout root holding `package.json` / `vite.config` — the build's cwd. */
  root: string;
  /** Progress/error sink (defaults to `console.error`). */
  log?: (message: string) => void;
}

/**
 * Build the React UI (vite → `dist/web`) so the daemon serves the current
 * interface on cold start. Runs the `build:web` package script in `root`.
 *
 * Never throws: a failed build logs and resolves `false`, so the daemon still
 * starts serving whatever build already exists (a stale UI beats no tool).
 *
 * @returns `true` if the build succeeded, `false` otherwise.
 */
export async function buildWebUi(deps: BuildUiDeps): Promise<boolean> {
  const runner: CommandRunner = deps.runner ?? bunRunner;
  const log: (message: string) => void = deps.log ?? ((m) => console.error(m));

  log("mergie: building web UI…");
  const result = await runner.run("bun", ["run", "build:web"], { cwd: deps.root });
  if (result.exitCode !== 0) {
    log(`mergie: web UI build failed (exit ${result.exitCode}); serving the existing build.\n${result.stderr}`);
    return false;
  }
  log("mergie: web UI build complete.");
  return true;
}
