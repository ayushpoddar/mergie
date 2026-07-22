import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Port the daemon binds to when `MERGIE_PORT` is unset or invalid. */
export const DEFAULT_PORT = 4517;

/**
 * Resolve the daemon port from the environment. Honours a valid `MERGIE_PORT`
 * (an integer in 1–65535), otherwise falls back to {@link DEFAULT_PORT}. This
 * lets a second instance (e.g. a dev worktree) run on its own port without
 * colliding with the primary daemon.
 */
export function resolvePort(env: Record<string, string | undefined> = process.env): number {
  const raw: string | undefined = env.MERGIE_PORT;
  const n: number = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_PORT;
}

/** Port the daemon binds to (overridable via `MERGIE_PORT`). */
export const DAEMON_PORT: number = resolvePort();

/** Base URL of the local daemon. */
export const DAEMON_URL = `http://localhost:${DAEMON_PORT}`;

/** Repository root (two levels up from this file: src/cli → root). */
export const ROOT: string = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Path to the built web UI served by the daemon. */
export const DIST_DIR: string = join(ROOT, "dist", "web");

/** Path to the CLI entry script (used to spawn the daemon process). */
export const BIN_PATH: string = join(ROOT, "src", "main.ts");
