import { bunRunner, type CommandRunner } from "./exec.ts";

/**
 * A pull request's lifecycle state on GitHub.
 * - `open` — still open (draft is tracked separately).
 * - `closed` — closed without merging.
 * - `merged` — merged into its base branch.
 */
export type PrState = "open" | "closed" | "merged";

/** Normalize GitHub's uppercase state enum to a {@link PrState}; unknown/missing → `open`. */
export function toPrState(raw: unknown): PrState {
  const v: string = typeof raw === "string" ? raw.toUpperCase() : "";
  if (v === "MERGED") return "merged";
  if (v === "CLOSED") return "closed";
  return "open";
}

/** Minimal commit metadata for a PR, from GitHub. */
export interface PrCommitMeta {
  /** Full commit SHA. */
  sha: string;
  /** Commit subject (message headline). */
  subject: string;
  /** First author's display name. */
  authorName: string;
  /** ISO commit date. */
  isoDate: string;
}

/** PR-level metadata from GitHub. */
export interface PrMeta {
  /** PR title. */
  title: string;
  /** PR description (the PR body), as GitHub-flavored markdown. Normalized to
   * LF line endings and trimmed; an empty string means "no description". */
  body: string;
  /** Target (base) branch name. */
  baseRef: string;
  /** Source (head) branch name. */
  headRef: string;
  /** Head commit SHA. */
  headSha: string;
  /** Lines added across the whole PR (base → head). */
  additions: number;
  /** Lines deleted across the whole PR (base → head). */
  deletions: number;
  /** Number of files changed across the whole PR. */
  changedFiles: number;
  /** ISO-8601 timestamp the PR was opened. */
  createdAtIso: string;
  /** ISO-8601 timestamp of the PR's last update. */
  updatedAtIso: string;
  /** GitHub login of the PR author. */
  authorLogin: string;
  /** Lifecycle state: open, closed (unmerged), or merged. */
  state: PrState;
  /** PR commits, oldest → newest (as GitHub returns them). */
  commits: PrCommitMeta[];
}

/** Identifies a PR for metadata lookup. */
export interface PrLookup {
  owner: string;
  repo: string;
  number: number;
}

/** Service for fetching PR-level metadata via the `gh` CLI. */
export interface GhPrService {
  fetchPr(ref: PrLookup): Promise<PrMeta>;
}

/** Create a {@link GhPrService}. */
export function createGhPrService(runner: CommandRunner = bunRunner): GhPrService {
  return {
    async fetchPr(ref: PrLookup): Promise<PrMeta> {
      const args: string[] = [
        "pr", "view", String(ref.number), "--repo", `${ref.owner}/${ref.repo}`,
        "--json", "title,body,baseRefName,headRefName,headRefOid,commits,additions,deletions,changedFiles,createdAt,updatedAt,author,state",
      ];
      const res = await runner.run("gh", args);
      if (res.exitCode !== 0) {
        throw new Error(`gh pr view failed (${res.exitCode}): ${res.stderr.trim()}`);
      }
      return toPrMeta(JSON.parse(res.stdout));
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Coerce a value to a finite integer, defaulting to 0. */
function int(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0;
}

/**
 * Normalize a raw PR body: coerce non-strings to "", convert CRLF → LF, and
 * trim. A whitespace-only body collapses to "" so callers can treat empty as
 * "no description provided".
 */
export function normalizeBody(raw: unknown): string {
  return str(raw).replace(/\r\n/g, "\n").trim();
}

/** Map raw `gh pr view` JSON into a typed {@link PrMeta}. */
function toPrMeta(raw: unknown): PrMeta {
  const rec: Record<string, unknown> = isRecord(raw) ? raw : {};
  const rawCommits: unknown[] = Array.isArray(rec.commits) ? rec.commits : [];
  const author: Record<string, unknown> = isRecord(rec.author) ? rec.author : {};
  return {
    title: str(rec.title),
    body: normalizeBody(rec.body),
    baseRef: str(rec.baseRefName),
    headRef: str(rec.headRefName),
    headSha: str(rec.headRefOid),
    additions: int(rec.additions),
    deletions: int(rec.deletions),
    changedFiles: int(rec.changedFiles),
    createdAtIso: str(rec.createdAt),
    updatedAtIso: str(rec.updatedAt),
    authorLogin: str(author.login),
    state: toPrState(rec.state),
    commits: rawCommits.map(toCommitMeta),
  };
}

function toCommitMeta(raw: unknown): PrCommitMeta {
  const rec: Record<string, unknown> = isRecord(raw) ? raw : {};
  const authors: unknown[] = Array.isArray(rec.authors) ? rec.authors : [];
  const first: Record<string, unknown> = isRecord(authors[0]) ? authors[0] : {};
  return {
    sha: str(rec.oid),
    subject: str(rec.messageHeadline),
    authorName: str(first.name),
    isoDate: str(rec.committedDate),
  };
}
