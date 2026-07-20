import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { bunRunner } from "@/services/exec.ts";
import type { CommandRunner } from "@/services/exec.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Structured information about a single git commit.
 */
export interface CommitInfo {
  /** Full 40-character commit SHA. */
  sha: string;
  /** Abbreviated 7-character commit SHA. */
  shortSha: string;
  /** The first line of the commit message. */
  subject: string;
  /** Display name of the commit author. */
  authorName: string;
  /** Email address of the commit author. */
  authorEmail: string;
  /**
   * ISO 8601 timestamp of the author date, e.g. `2024-06-01T09:00:00+00:00`.
   * Includes timezone offset so callers can display local time.
   */
  isoDate: string;
}

/**
 * The git service provides all git operations needed for reviewing a PR.
 * Every command is executed with `git -C <cloneDir>` so the instance is
 * bound to one local repository directory.
 */
export interface GitService {
  /**
   * Ensure the repository is available locally and up to date.
   *
   * - If `<cloneDir>/.git` is absent: runs `git clone <sshUrl> <cloneDir>`.
   * - If present: runs `git -C <cloneDir> fetch origin <refs...>`.
   *
   * Throws if the git process exits with a non-zero code; the error message
   * includes stderr so callers can surface the reason.
   *
   * @param sshUrl - SSH remote URL, e.g. `git@github.com:org/repo.git`.
   * @param refs   - Ref names / refspecs to fetch (e.g. `["main", "refs/pull/1/head"]`).
   */
  cloneOrFetch(sshUrl: string, refs: string[]): Promise<void>;

  /**
   * List commits in the range `startSha..endSha`, ordered oldest → newest.
   *
   * The `startSha` commit itself is excluded (standard git two-dot range
   * semantics). Returns an empty array when the range contains no commits.
   *
   * @param startSha - Exclusive lower bound (SHA or any git revision).
   * @param endSha   - Inclusive upper bound (SHA or any git revision).
   */
  listCommits(startSha: string, endSha: string): Promise<CommitInfo[]>;

  /**
   * Compute the best common ancestor of two commits.
   *
   * Equivalent to `git merge-base a b`. Returns the trimmed SHA string.
   *
   * @param a - First commit SHA or ref.
   * @param b - Second commit SHA or ref.
   */
  mergeBase(a: string, b: string): Promise<string>;

  /**
   * Return the raw text content of a file at a specific commit.
   *
   * Runs `git show <sha>:<path>`. Returns `null` when the command exits
   * non-zero (file absent at that ref, deleted, or binary unreadable as text).
   *
   * @param sha  - Commit SHA (or any git revision).
   * @param path - Repo-relative file path.
   */
  fileAtRef(sha: string, path: string): Promise<string | null>;

  /**
   * Produce a unified diff between two commits, optionally restricted to a
   * subset of file paths.
   *
   * Runs `git diff <startSha> <endSha> [-- <paths...>]`. Returns the raw
   * unified-diff string (suitable for passing to `parseUnifiedDiff`). Returns
   * an empty string when there are no differences.
   *
   * @param startSha - Base commit SHA.
   * @param endSha   - Head commit SHA.
   * @param paths    - Optional list of paths to restrict the diff to.
   * @param ignoreWhitespace - When true, collapse whitespace-only changes
   *                           (passes `--ignore-all-space` to git).
   */
  rawDiff(startSha: string, endSha: string, paths?: string[], ignoreWhitespace?: boolean): Promise<string>;

  /**
   * Like {@link rawDiff}, but in `--word-diff=porcelain` form (parsed by
   * `parseWordDiff` into intra-line changed ranges). Returns an empty string
   * when there are no differences.
   */
  rawWordDiff(startSha: string, endSha: string, paths?: string[], ignoreWhitespace?: boolean): Promise<string>;

  /**
   * Full-file unified diff for a single path with all context expanded (large
   * `-U`), suitable for a split full-file view. Returns the raw diff string.
   */
  fullFileDiff(startSha: string, endSha: string, path: string, ignoreWhitespace?: boolean): Promise<string>;

  /**
   * Like {@link fullFileDiff}, but in `--word-diff=porcelain` form for the
   * split full-file view's intra-line highlighting.
   */
  fullFileWordDiff(startSha: string, endSha: string, path: string, ignoreWhitespace?: boolean): Promise<string>;

  /**
   * Ensure a detached git worktree exists with the tree checked out at `sha`,
   * and return its absolute path. Worktrees are cached per-SHA under a `wt`
   * directory beside the clone; a symbol lookup can then run `sem`/`rg` against
   * the on-disk files of that exact commit without disturbing the main clone.
   *
   * @param sha - Commit SHA to check out.
   */
  ensureWorktree(sha: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Format string constants
// ---------------------------------------------------------------------------

/** Field separator between commit fields — ASCII Unit Separator (rarely appears in commit data). */
const FIELD_SEP = "\x1f" as const;

/** Record separator between commits — ASCII Record Separator. */
const RECORD_SEP = "\x1e" as const;

/**
 * git log --format string that produces one record per commit.
 * Fields: %H (full sha) %x1f %h (short sha) %x1f %s (subject) %x1f
 *         %an (author name) %x1f %ae (author email) %x1f %aI (ISO 8601 author date)
 * Records are separated by %x1e.
 */
const LOG_FORMAT =
  `--format=%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${RECORD_SEP}` as const;

/**
 * Extra `git diff` flags to emit the porcelain word-diff. The regex makes each
 * identifier run one token and every other non-space character its own token,
 * so highlighting lands on whole words rather than whitespace-delimited chunks.
 */
const WORD_DIFF_ARGS = ["--word-diff=porcelain", "--word-diff-regex=[A-Za-z0-9_]+|[^[:space:]]"] as const;

/**
 * `git diff` option that collapses whitespace-only differences: a line whose
 * only change is indentation/spacing stops showing as changed, and a hunk that
 * was purely whitespace disappears. Equivalent to GitHub's "Hide whitespace".
 */
const IGNORE_WHITESPACE_ARG = "--ignore-all-space" as const;

/** The whitespace-ignoring arg as a 0- or 1-element array, for arg splicing. */
function wsArgs(ignoreWhitespace: boolean | undefined): readonly string[] {
  return ignoreWhitespace ? [IGNORE_WHITESPACE_ARG] : [];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Parse a single record (already split on RECORD_SEP) into CommitInfo. */
function parseRecord(record: string): CommitInfo | null {
  const record_ = record.trim();
  if (record_ === "") return null;
  const parts = record_.split(FIELD_SEP);
  const [sha, shortSha, subject, authorName, authorEmail, isoDate] = parts;
  if (!sha || !shortSha || !subject || !authorName || !authorEmail || !isoDate) return null;
  return { sha, shortSha, subject, authorName, authorEmail, isoDate };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `GitService` bound to `cloneDir`, using `runner` for subprocess
 * execution. Defaults to the real Bun-backed runner.
 *
 * @param cloneDir - Absolute path to the local repository directory.
 * @param runner   - Command runner to use; defaults to `bunRunner`.
 */
export function createGitService(
  cloneDir: string,
  runner: CommandRunner = bunRunner,
): GitService {
  return {
    async cloneOrFetch(sshUrl, refs) {
      const hasGit = existsSync(`${cloneDir}/.git`);
      const args: string[] = hasGit
        ? ["-C", cloneDir, "fetch", "origin", ...refs]
        : ["clone", sshUrl, cloneDir];

      const result = await runner.run("git", args);
      if (result.exitCode !== 0) {
        throw new Error(`git operation failed: ${result.stderr}`);
      }
    },

    async listCommits(startSha, endSha) {
      const result = await runner.run("git", [
        "-C",
        cloneDir,
        "log",
        LOG_FORMAT,
        `${startSha}..${endSha}`,
      ]);

      if (result.exitCode !== 0) {
        throw new Error(`git log failed: ${result.stderr}`);
      }

      const commits: CommitInfo[] = result.stdout
        .split(RECORD_SEP)
        .map(parseRecord)
        .filter((c): c is CommitInfo => c !== null)
        .reverse(); // git log is newest-first; we want oldest-first

      return commits;
    },

    async mergeBase(a, b) {
      const result = await runner.run("git", ["-C", cloneDir, "merge-base", a, b]);
      if (result.exitCode !== 0) {
        throw new Error(`git merge-base failed: ${result.stderr}`);
      }
      return result.stdout.trim();
    },

    async fileAtRef(sha, path) {
      const result = await runner.run("git", ["-C", cloneDir, "show", `${sha}:${path}`]);
      if (result.exitCode !== 0) return null;
      return result.stdout;
    },

    async rawDiff(startSha, endSha, paths, ignoreWhitespace) {
      const args: string[] = ["-C", cloneDir, "diff", ...wsArgs(ignoreWhitespace), startSha, endSha];
      if (paths !== undefined && paths.length > 0) {
        args.push("--", ...paths);
      }
      const result = await runner.run("git", args);
      if (result.exitCode !== 0) {
        throw new Error(`git diff failed: ${result.stderr}`);
      }
      return result.stdout;
    },

    async rawWordDiff(startSha, endSha, paths, ignoreWhitespace) {
      const args: string[] = ["-C", cloneDir, "diff", ...wsArgs(ignoreWhitespace), ...WORD_DIFF_ARGS, startSha, endSha];
      if (paths !== undefined && paths.length > 0) {
        args.push("--", ...paths);
      }
      const result = await runner.run("git", args);
      if (result.exitCode !== 0) {
        throw new Error(`git word-diff failed: ${result.stderr}`);
      }
      return result.stdout;
    },

    async fullFileDiff(startSha, endSha, path, ignoreWhitespace) {
      const args: string[] = ["-C", cloneDir, "diff", ...wsArgs(ignoreWhitespace), startSha, endSha, "-U1000000", "--", path];
      const result = await runner.run("git", args);
      if (result.exitCode !== 0) {
        throw new Error(`git diff failed: ${result.stderr}`);
      }
      return result.stdout;
    },

    async fullFileWordDiff(startSha, endSha, path, ignoreWhitespace) {
      const args: string[] = ["-C", cloneDir, "diff", ...wsArgs(ignoreWhitespace), ...WORD_DIFF_ARGS, startSha, endSha, "-U1000000", "--", path];
      const result = await runner.run("git", args);
      if (result.exitCode !== 0) {
        throw new Error(`git word-diff failed: ${result.stderr}`);
      }
      return result.stdout;
    },

    async ensureWorktree(sha) {
      const wt: string = join(dirname(cloneDir), "wt", sha);
      if (existsSync(wt)) return wt;
      const result = await runner.run("git", ["-C", cloneDir, "worktree", "add", "--force", "--detach", wt, sha]);
      if (result.exitCode !== 0) {
        throw new Error(`git worktree add failed: ${result.stderr}`);
      }
      return wt;
    },
  };
}
