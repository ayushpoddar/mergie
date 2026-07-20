import { bunRunner, type CommandRunner } from "./exec.ts";

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
        "--json", "title,body,baseRefName,headRefName,headRefOid,commits",
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
  return {
    title: str(rec.title),
    body: normalizeBody(rec.body),
    baseRef: str(rec.baseRefName),
    headRef: str(rec.headRefName),
    headSha: str(rec.headRefOid),
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
