import { join } from "node:path";

/** Env var the dev wrapper (`bin/mergie-dev`) sets to declare an isolated run. */
export const DEV_MARKER = "MERGIE_DEV";

/** Env var a user can set to force a bare source run despite the guard. */
export const FORCE_MARKER = "MERGIE_FORCE";

/**
 * Inputs for {@link isBlockedSourceRun} — injected so the check stays pure and
 * testable without touching the real filesystem or environment.
 */
export interface SourceGuardInput {
  /** Install/repo root to probe for the `.git` source-checkout marker. */
  root: string;
  /** Environment variables to read. */
  env: Record<string, string | undefined>;
  /** Existence probe for a path (defaults to a real `fs.existsSync` at call sites). */
  exists: (path: string) => boolean;
}

/**
 * True when mergie is being launched directly from a source checkout without
 * the dev wrapper — a bare `src/main.ts` run that would collide with the
 * primary daemon (port 4517 + your real data dir).
 *
 * A source checkout is detected by a `.git` entry at {@link SourceGuardInput.root}
 * (present in a clone/worktree, absent from the published npm package or a
 * `bunx` cache). `MERGIE_DEV` (set by `bin/mergie-dev`) or `MERGIE_FORCE` (manual
 * override) opt out.
 */
export function isBlockedSourceRun({ root, env, exists }: SourceGuardInput): boolean {
  if (env[DEV_MARKER] || env[FORCE_MARKER]) return false;
  return exists(join(root, ".git"));
}

/** Guidance shown when a bare source run is blocked. */
export const SOURCE_RUN_GUIDANCE = [
  "mergie: refusing to run directly from a source checkout.",
  "This would use the primary daemon (port 4517) and your real data directory,",
  "risking collisions with your live reviews.",
  "",
  "  • For development, run:  bin/mergie-dev --no-open",
  "    (isolated on port 4518 with data under ./devdata)",
  "  • To force this run anyway, set MERGIE_FORCE=1",
].join("\n");
