/**
 * Startup preflight checks. Hard checks (Bun version, gh) must pass or the CLI
 * aborts; soft checks (rg, sem, claude) only warn about disabled features.
 *
 * Logic here is injectable via {@link CommandProbe} so it can be unit-tested
 * without spawning real processes. The concrete {@link bunProbe} wires it to
 * `Bun.which`/`Bun.spawn`.
 */

/** Minimum Bun version mergie supports (mirrors package.json `engines.bun`). */
export const MIN_BUN_VERSION = "1.2.0";

/** Parsed [major, minor, patch] of the minimum, for comparisons. */
const MIN_BUN: readonly [number, number, number] = [1, 2, 0];

/**
 * Abstraction over probing the environment for external tools, so preflight
 * stays testable. Implemented for real by {@link bunProbe}.
 */
export interface CommandProbe {
  /** Whether `cmd` resolves on PATH. */
  exists(cmd: string): boolean | Promise<boolean>;
  /** Run `cmd args...`, capturing its exit code and stdout. */
  run(cmd: string, args: string[]): Promise<{ code: number; stdout: string }>;
}

/** Parse a "1.2.3" version (ignoring any pre-release/build suffix). */
function parseVersion(v: string): [number, number, number] | null {
  const m = v.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (m === null) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? "0")];
}

/** True when `version` is >= {@link MIN_BUN_VERSION}. */
export function bunVersionSatisfies(version: string): boolean {
  const got = parseVersion(version);
  if (got === null) return false;
  const [gMaj, gMin, gPat] = got;
  const [mMaj, mMin, mPat] = MIN_BUN;
  if (gMaj !== mMaj) return gMaj > mMaj;
  if (gMin !== mMin) return gMin > mMin;
  return gPat >= mPat;
}

/** Hard-fail message when the running Bun is older than the minimum. */
export function bunOutdatedMessage(found: string): string {
  return [
    `mergie requires Bun >= ${MIN_BUN_VERSION}, but found ${found || "an unknown version"}.`,
    "Upgrade Bun:  bun upgrade",
    "See https://bun.sh for details.",
  ].join("\n");
}

/** Hard-fail message when the GitHub CLI is not installed. */
export const GH_MISSING = [
  "mergie needs the GitHub CLI (gh), which was not found on your PATH.",
  "mergie uses gh for GitHub API access and for cloning pull requests.",
  "Install it:      https://cli.github.com  (e.g. `brew install gh`)",
  "Then sign in:    gh auth login",
].join("\n");

/** Hard-fail message when gh is installed but not signed in. */
export const GH_UNAUTHENTICATED = [
  "The GitHub CLI (gh) is installed but not authenticated.",
  "mergie uses gh for GitHub API access and for cloning pull requests.",
  "Sign in:  gh auth login",
].join("\n");

/** Warning when ripgrep is absent (disables General search). */
export const RG_MISSING = [
  "ripgrep (rg) not found — the General (text/regex) code search will not work.",
  "Install it:  brew install ripgrep   (https://github.com/BurntSushi/ripgrep)",
].join("\n");

/** Warning when sem is absent (disables Symbol lookups). */
export const SEM_MISSING = [
  "sem not found — Symbol definition/usages lookups will not work.",
  "Install it:  brew install sem-cli   (https://ataraxy-labs.github.io/sem/)",
].join("\n");

/** Warning when the Claude CLI is absent (disables AI features). */
export const CLAUDE_MISSING = [
  "claude not found — AI review & chat will not work.",
  "Install Claude Code:  https://claude.com/claude-code",
].join("\n");

/** Optional tools checked at startup, in the order warnings are emitted. */
const SOFT_CHECKS: ReadonlyArray<{ cmd: string; message: string }> = [
  { cmd: "rg", message: RG_MISSING },
  { cmd: "sem", message: SEM_MISSING },
  { cmd: "claude", message: CLAUDE_MISSING },
];

/**
 * Run the hard checks. Returns the list of failure messages (empty = all pass).
 *
 * @param bunVersion the running Bun version (defaults to `Bun.version`).
 */
export async function runHardChecks(probe: CommandProbe, bunVersion: string = Bun.version): Promise<string[]> {
  const errors: string[] = [];

  if (!bunVersionSatisfies(bunVersion)) errors.push(bunOutdatedMessage(bunVersion));

  if (!(await probe.exists("gh"))) {
    errors.push(GH_MISSING);
  } else if ((await probe.run("gh", ["auth", "status"])).code !== 0) {
    errors.push(GH_UNAUTHENTICATED);
  }

  return errors;
}

/** Run the soft checks. Returns a warning per missing optional tool. */
export async function runSoftChecks(probe: CommandProbe): Promise<string[]> {
  const warnings: string[] = [];
  for (const { cmd, message } of SOFT_CHECKS) {
    if (!(await probe.exists(cmd))) warnings.push(message);
  }
  return warnings;
}

/** The real probe, backed by `Bun.which` and `Bun.spawn`. */
export const bunProbe: CommandProbe = {
  exists(cmd) {
    return Bun.which(cmd) !== null;
  },
  async run(cmd, args) {
    const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "ignore" });
    const stdout: string = await new Response(proc.stdout).text();
    const code: number = await proc.exited;
    return { code, stdout };
  },
};
