import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { bunRunner } from "@/services/exec.ts";
import type { CommandResult, CommandRunner } from "@/services/exec.ts";
import { createGitService } from "@/services/git.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DIR = new URL(
  "../../tmp/git-svc-test",
  import.meta.url,
).pathname;

/** Run a real git command in a dir, throw on non-zero exit. */
async function git(dir: string, ...args: string[]): Promise<string> {
  const r = await bunRunner.run("git", ["-C", dir, ...args]);
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** Create a file, stage and commit it. Returns the commit SHA. */
async function commit(dir: string, file: string, content: string, msg: string): Promise<string> {
  await writeFile(`${dir}/${file}`, content, "utf8");
  await git(dir, "add", file);
  await git(dir, "commit", "-m", msg);
  return git(dir, "rev-parse", "HEAD");
}

// ---------------------------------------------------------------------------
// Integration: real git repo
// ---------------------------------------------------------------------------

describe("createGitService — integration (real git)", () => {
  let repoDir: string;
  let sha1: string;
  let sha2: string;
  let sha3: string;
  let sha4: string;

  beforeAll(async () => {
    repoDir = `${TEST_DIR}/repo`;
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(repoDir, { recursive: true });

    // Init repo with a predictable local identity
    await git(repoDir, "init", "-b", "main");
    await git(repoDir, "config", "user.email", "test@mergie.local");
    await git(repoDir, "config", "user.name", "Test User");

    // Commit 1 – add alpha.txt
    sha1 = await commit(repoDir, "alpha.txt", "line 1\n", "feat: add alpha");

    // Commit 2 – modify alpha.txt
    sha2 = await commit(repoDir, "alpha.txt", "line 1\nline 2\n", "feat: extend alpha");

    // Commit 3 – add beta.txt
    sha3 = await commit(repoDir, "beta.txt", "beta content\n", "feat: add beta");

    // Branch: create feature branch from sha1, then add a commit
    await git(repoDir, "checkout", "-b", "feature", sha1);
    sha4 = await commit(repoDir, "gamma.txt", "gamma\n", "feat: add gamma");

    // Return to main
    await git(repoDir, "checkout", "main");

    // Add a self-referencing origin so cloneOrFetch fetch tests work
    await git(repoDir, "remote", "add", "origin", `file://${repoDir}`);
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  // ----- listCommits -----

  test("listCommits returns commits oldest→newest", async () => {
    const svc = createGitService(repoDir);
    const commits = await svc.listCommits(sha1, sha3);

    expect(commits).toHaveLength(2);

    const [first, second] = commits;
    expect(first?.sha).toBe(sha2);
    expect(first?.shortSha).toHaveLength(7);
    expect(first?.subject).toBe("feat: extend alpha");
    expect(first?.authorName).toBe("Test User");
    expect(first?.authorEmail).toBe("test@mergie.local");
    expect(first?.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(second?.sha).toBe(sha3);
    expect(second?.subject).toBe("feat: add beta");
  });

  test("listCommits returns empty array when range has no commits", async () => {
    const svc = createGitService(repoDir);
    const commits = await svc.listCommits(sha3, sha3);
    expect(commits).toHaveLength(0);
  });

  // ----- mergeBase -----

  test("mergeBase returns the common ancestor", async () => {
    const svc = createGitService(repoDir);
    const base = await svc.mergeBase(sha3, sha4);
    // feature branched from sha1
    expect(base).toBe(sha1);
  });

  // ----- fileAtRef -----

  test("fileAtRef returns file contents at a given SHA", async () => {
    const svc = createGitService(repoDir);
    const content = await svc.fileAtRef(sha1, "alpha.txt");
    expect(content).toBe("line 1\n");
  });

  test("fileAtRef returns null when file does not exist at that ref", async () => {
    const svc = createGitService(repoDir);
    const content = await svc.fileAtRef(sha1, "beta.txt");
    expect(content).toBeNull();
  });

  // ----- rawDiff -----

  test("rawDiff returns a non-empty diff string for changed range", async () => {
    const svc = createGitService(repoDir);
    const diff = await svc.rawDiff(sha1, sha2);
    expect(diff).toContain("diff --git");
    expect(diff).toContain("alpha.txt");
    expect(diff).toContain("+line 2");
  });

  test("rawDiff with paths filters to matching files only", async () => {
    const svc = createGitService(repoDir);
    // sha1..sha3 touches both alpha.txt and beta.txt; restrict to beta.txt
    const diff = await svc.rawDiff(sha1, sha3, ["beta.txt"]);
    expect(diff).toContain("beta.txt");
    expect(diff).not.toContain("alpha.txt");
  });

  test("rawDiff returns empty string when no changes in range", async () => {
    const svc = createGitService(repoDir);
    const diff = await svc.rawDiff(sha1, sha1);
    expect(diff).toBe("");
  });

  // ----- cloneOrFetch (fetch path using repo as origin) -----

  test("cloneOrFetch fetches into existing repo (.git present)", async () => {
    const svc = createGitService(repoDir);
    // repoDir already has .git; use itself as "origin" (file:// URL)
    // This tests the fetch branch; it should not throw
    await expect(svc.cloneOrFetch(`file://${repoDir}`, ["main"])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests: fake CommandRunner
// ---------------------------------------------------------------------------

/** Build a fake runner that returns a single canned response. */
function fakeRunner(stdout: string, exitCode = 0, stderr = ""): CommandRunner & { calls: { cmd: string; args: string[] }[] } {
  const calls: { cmd: string; args: string[] }[] = [];
  return {
    calls,
    async run(cmd: string, args: string[]): Promise<CommandResult> {
      calls.push({ cmd, args });
      return { stdout, stderr, exitCode };
    },
  };
}

// Delimiter bytes used in the format string (must match implementation)
const FS = "\x1f"; // field separator
const RS = "\x1e"; // record separator

describe("createGitService — unit (fake runner)", () => {
  const cloneDir = "/fake/repo";

  // ----- cloneOrFetch: clone path -----

  test("cloneOrFetch clones when .git is absent (uses correct argv)", async () => {
    // Point cloneDir to a path that definitely has no .git
    const noGitDir = "/nonexistent-mergie-dir";
    const runner = fakeRunner("", 0);
    const svc = createGitService(noGitDir, runner);
    await svc.cloneOrFetch("https://github.com/org/repo.git", ["refs/pull/1/head"]);

    expect(runner.calls).toHaveLength(1);
    const call = runner.calls[0];
    expect(call?.cmd).toBe("git");
    // Clones over HTTPS, authenticating via the gh CLI credential helper (the
    // empty helper first resets any inherited helper), so no SSH setup is needed.
    expect(call?.args).toEqual([
      "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential",
      "clone", "https://github.com/org/repo.git", noGitDir,
    ]);
  });

  // ----- cloneOrFetch: fetch path -----

  test("cloneOrFetch fetches when .git is present (uses correct argv)", async () => {
    // Use the real worktree repo dir — it has a .git
    const realDir = new URL("../../", import.meta.url).pathname;
    const runner = fakeRunner("", 0);
    const svc = createGitService(realDir, runner);
    await svc.cloneOrFetch("https://github.com/org/repo.git", ["main", "develop"]);

    expect(runner.calls).toHaveLength(1);
    const call = runner.calls[0];
    expect(call?.cmd).toBe("git");
    expect(call?.args).toEqual([
      "-c", "credential.helper=",
      "-c", "credential.helper=!gh auth git-credential",
      "-C", realDir, "fetch", "origin", "main", "develop",
    ]);
  });

  // ----- cloneOrFetch: error propagation -----

  test("cloneOrFetch throws with stderr on non-zero exit", async () => {
    const noGitDir = "/nonexistent-mergie-dir";
    const runner = fakeRunner("", 128, "fatal: repo not found");
    const svc = createGitService(noGitDir, runner);
    await expect(svc.cloneOrFetch("https://github.com/org/repo.git", [])).rejects.toThrow(
      "fatal: repo not found",
    );
  });

  // ----- listCommits: parsing -----

  test("listCommits parses delimiter-separated format into CommitInfo[]", async () => {
    // Simulate git log output in our format (RS-separated records, FS-separated fields)
    // Note: git log --format outputs records in newest→oldest; we reverse
    const record1 = `abc1234abcdef${FS}abc1234${FS}feat: second${FS}Alice${FS}alice@x.com${FS}2024-06-02T10:00:00+00:00`;
    const record2 = `def5678defghi${FS}def5678${FS}feat: first${FS}Bob${FS}bob@x.com${FS}2024-06-01T09:00:00+00:00`;
    const rawOutput = `${record1}${RS}${record2}${RS}`;

    const runner = fakeRunner(rawOutput, 0);
    const svc = createGitService(cloneDir, runner);
    const commits = await svc.listCommits("startSha", "endSha");

    // oldest first → record2, record1
    expect(commits).toHaveLength(2);
    expect(commits[0]?.sha).toBe("def5678defghi");
    expect(commits[0]?.shortSha).toBe("def5678");
    expect(commits[0]?.subject).toBe("feat: first");
    expect(commits[0]?.authorName).toBe("Bob");
    expect(commits[0]?.authorEmail).toBe("bob@x.com");
    expect(commits[0]?.isoDate).toBe("2024-06-01T09:00:00+00:00");

    expect(commits[1]?.sha).toBe("abc1234abcdef");
    expect(commits[1]?.subject).toBe("feat: second");
  });

  test("listCommits passes correct argv to git", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.listCommits("aaa", "bbb");

    const call = runner.calls[0];
    expect(call?.cmd).toBe("git");
    // Must include -C, log, --format=..., and the range
    expect(call?.args[0]).toBe("-C");
    expect(call?.args[1]).toBe(cloneDir);
    expect(call?.args[2]).toBe("log");
    // format arg contains the delimiter chars
    expect(call?.args[3]).toContain("--format=");
    expect(call?.args[3]).toContain("%H");
    // range
    expect(call?.args[4]).toBe("aaa..bbb");
  });

  // ----- fileAtRef: null on non-zero -----

  test("fileAtRef returns null on non-zero exit", async () => {
    const runner = fakeRunner("", 128, "fatal: Path not found");
    const svc = createGitService(cloneDir, runner);
    const result = await svc.fileAtRef("deadbeef", "missing.ts");
    expect(result).toBeNull();
  });

  test("fileAtRef returns stdout on success", async () => {
    const runner = fakeRunner("file contents here\n", 0);
    const svc = createGitService(cloneDir, runner);
    const result = await svc.fileAtRef("deadbeef", "exists.ts");
    expect(result).toBe("file contents here\n");
  });

  // ----- ignore-whitespace flag on diffs -----

  test("rawDiff omits --ignore-all-space by default", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.rawDiff("aaa", "bbb");
    expect(runner.calls[0]?.args).not.toContain("--ignore-all-space");
  });

  test("rawDiff inserts --ignore-all-space when ignoreWhitespace is true", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.rawDiff("aaa", "bbb", undefined, true);
    expect(runner.calls[0]?.args).toEqual(["-C", cloneDir, "diff", "--ignore-all-space", "aaa", "bbb"]);
  });

  test("rawDiff keeps --ignore-all-space before the pathspec when both given", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.rawDiff("aaa", "bbb", ["x.ts"], true);
    expect(runner.calls[0]?.args).toEqual(["-C", cloneDir, "diff", "--ignore-all-space", "aaa", "bbb", "--", "x.ts"]);
  });

  test("rawWordDiff inserts --ignore-all-space before the word-diff args", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.rawWordDiff("aaa", "bbb", undefined, true);
    const args = runner.calls[0]?.args ?? [];
    expect(args).toContain("--ignore-all-space");
    expect(args.indexOf("--ignore-all-space")).toBeLessThan(args.indexOf("--word-diff=porcelain"));
  });

  test("fullFileDiff inserts --ignore-all-space when ignoreWhitespace is true", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.fullFileDiff("aaa", "bbb", "x.ts", true);
    const args = runner.calls[0]?.args ?? [];
    expect(args).toContain("--ignore-all-space");
    expect(args.indexOf("--ignore-all-space")).toBeLessThan(args.indexOf("aaa"));
  });

  test("fullFileWordDiff inserts --ignore-all-space when ignoreWhitespace is true", async () => {
    const runner = fakeRunner("", 0);
    const svc = createGitService(cloneDir, runner);
    await svc.fullFileWordDiff("aaa", "bbb", "x.ts", true);
    expect(runner.calls[0]?.args).toContain("--ignore-all-space");
  });
});
