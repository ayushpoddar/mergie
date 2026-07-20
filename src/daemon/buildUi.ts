import { existsSync } from "node:fs";
import { join } from "node:path";
import { bunRunner, type CommandRunner } from "@/services/exec.ts";

/** Dependencies for building the web UI. */
export interface BuildUiDeps {
  /** Command runner to execute the build (defaults to the real Bun-backed runner). */
  runner?: CommandRunner;
  /** Checkout root holding `package.json` / `vite.config` — the build's cwd. */
  root: string;
  /** Progress/error sink (defaults to `console.error`). */
  log?: (message: string) => void;
  /**
   * Whether the build toolchain (vite) is available under `root`. Defaults to
   * probing `root/node_modules/.bin/vite`. Published installs ship a prebuilt UI
   * and omit the toolchain, so this is `false` for them.
   */
  hasBuildTooling?: () => boolean;
}

/**
 * Ensure the daemon has a web UI to serve. In a development checkout (the build
 * toolchain is installed) this rebuilds the React UI (vite → `dist/web`) so the
 * daemon serves the current interface on cold start. In a published install the
 * toolchain is absent and a prebuilt `dist/web` ships in the package, so there is
 * nothing to build — it serves the bundled UI as-is.
 *
 * Never throws: a failed build logs and resolves `false`, so the daemon still
 * starts serving whatever build already exists (a stale UI beats no tool).
 *
 * @returns `true` if the UI is ready (freshly built or already bundled), `false`
 *          if a build was attempted and failed.
 */
export async function buildWebUi(deps: BuildUiDeps): Promise<boolean> {
  const runner: CommandRunner = deps.runner ?? bunRunner;
  const log: (message: string) => void = deps.log ?? ((m) => console.error(m));
  const hasBuildTooling: () => boolean =
    deps.hasBuildTooling ?? (() => existsSync(join(deps.root, "node_modules", ".bin", "vite")));

  // Published install: no toolchain to rebuild with; serve the bundled UI.
  if (!hasBuildTooling()) {
    log("mergie: serving prebuilt web UI.");
    return true;
  }

  log("mergie: building web UI…");
  const result = await runner.run("bun", ["run", "build:web"], { cwd: deps.root });
  if (result.exitCode !== 0) {
    log(`mergie: web UI build failed (exit ${result.exitCode}); serving the existing build.\n${result.stderr}`);
    return false;
  }
  log("mergie: web UI build complete.");
  return true;
}
