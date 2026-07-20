import { join } from "node:path";
import { homedir } from "node:os";
import type { PullRequestRef } from "./url.ts";

/**
 * Environment injection for path resolution — lets tests supply env/home
 * without touching real globals.
 */
export interface PathEnv {
  /** Environment variables to read (defaults to `process.env`). */
  env?: Record<string, string | undefined>;
  /** Home directory (defaults to `os.homedir()`). */
  home?: string;
}

/** Per-PR directory name, e.g. `pr_withastro_astro_17360`. */
function prSlug(ref: PullRequestRef): string {
  return `pr_${ref.owner}_${ref.repo}_${ref.number}`;
}

function resolveEnv(opts?: PathEnv): { env: Record<string, string | undefined>; home: string } {
  return { env: opts?.env ?? process.env, home: opts?.home ?? homedir() };
}

/**
 * Root of mergie's per-PR persistent data:
 * `$XDG_DATA_HOME/mergie/pr_<owner>_<repo>_<n>`, falling back to
 * `~/.local/share/mergie/...` when `XDG_DATA_HOME` is unset.
 */
export function dataDir(ref: PullRequestRef, opts?: PathEnv): string {
  const { env, home } = resolveEnv(opts);
  const base: string = env.XDG_DATA_HOME || join(home, ".local", "share");
  return join(base, "mergie", prSlug(ref));
}

/**
 * mergie's config directory: `$XDG_CONFIG_HOME/mergie`, falling back to
 * `~/.config/mergie`.
 */
export function configDir(opts?: PathEnv): string {
  const { env, home } = resolveEnv(opts);
  const base: string = env.XDG_CONFIG_HOME || join(home, ".config");
  return join(base, "mergie");
}

/** Reusable clone directory for a PR (inside its data dir). */
export function cloneDir(ref: PullRequestRef, opts?: PathEnv): string {
  return join(dataDir(ref, opts), "clone");
}

/** Directory holding AI-generated artifacts for a PR. */
export function artifactsDir(ref: PullRequestRef, opts?: PathEnv): string {
  return join(dataDir(ref, opts), "artifacts");
}

/** SQLite database file path for a PR. */
export function dbPath(ref: PullRequestRef, opts?: PathEnv): string {
  return join(dataDir(ref, opts), "mergie.db");
}
