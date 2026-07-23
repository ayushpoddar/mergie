import { bunRunner, type CommandRunner } from "./exec.ts";
import { parsePrUrl } from "@/domain/url.ts";
import { toPrState, type PrState } from "./ghPr.ts";

/** How the authenticated user is related to a pull request. */
export type PrRelationship = "authored" | "assigned" | "review-requested";

/** A pull request the authenticated user cares about, from GitHub search. */
export interface MyPrSummary {
  /** Repository owner / organisation. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Pull request number. */
  number: number;
  /** PR title. */
  title: string;
  /** Canonical PR URL (used as the dedupe key and to load the PR). */
  url: string;
  /** GitHub login of the PR author. */
  author: string;
  /** Whether the PR is a draft. */
  isDraft: boolean;
  /** ISO-8601 last-updated timestamp (used to sort newest-first). */
  updatedAtIso: string;
  /** ISO-8601 timestamp the PR was opened. */
  createdAtIso: string;
  /** All relationships the viewer has to this PR, in canonical order. */
  relationships: PrRelationship[];
}

/** Identifies a PR for a size lookup. */
export interface PrSizeRef {
  /** Repository owner. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** PR number. */
  number: number;
}

/** The diff-size of a PR (whole PR, base → head). */
export interface PrSize {
  /** Lines added. */
  additions: number;
  /** Lines deleted. */
  deletions: number;
  /** Files changed. */
  changedFiles: number;
}

/** Service for listing the viewer's open PRs via the `gh` CLI. */
export interface GhSearchService {
  /** Open PRs authored by, assigned to, or review-requested from the viewer. */
  listMyPrs(): Promise<MyPrSummary[]>;
  /**
   * Fetch diff-sizes for many PRs in one batched GraphQL call, keyed by
   * {@link sizeKey}. PRs the viewer can't see are omitted from the result.
   */
  prSizes(refs: readonly PrSizeRef[]): Promise<Record<string, PrSize>>;
  /**
   * Fetch the current lifecycle state for many PRs in one batched GraphQL call,
   * keyed by {@link sizeKey}. PRs the viewer can't see are omitted.
   */
  prStates(refs: readonly PrSizeRef[]): Promise<Record<string, PrState>>;
}

/** The `--<flag>=@me` search filter for each relationship. */
const RELATION_FLAG: Record<PrRelationship, string> = {
  authored: "--author=@me",
  assigned: "--assignee=@me",
  "review-requested": "--review-requested=@me",
};

/** Canonical relationship order for stable, deduped unions. */
const RELATION_ORDER: readonly PrRelationship[] = ["authored", "assigned", "review-requested"];

/** JSON fields requested from `gh search prs`. */
const JSON_FIELDS = "number,title,url,author,isDraft,updatedAt,createdAt";

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

/** Stable map key for a PR size lookup: `owner/repo/number`. */
export function sizeKey(ref: PrSizeRef): string {
  return `${ref.owner}/${ref.repo}/${ref.number}`;
}

/** Build one batched GraphQL query aliasing each ref as `p<index>`. */
export function buildSizesQuery(refs: readonly PrSizeRef[]): string {
  const parts: string[] = refs.map((r, i) =>
    `p${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.repo)}) ` +
    `{ pullRequest(number: ${r.number}) { additions deletions changedFiles } }`);
  return `query {\n${parts.join("\n")}\n}`;
}

/** Map a batched-sizes GraphQL response back to a {@link sizeKey}-keyed record. */
export function parseSizes(rawJson: string, refs: readonly PrSizeRef[]): Record<string, PrSize> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {};
  }
  const data: Record<string, unknown> = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : {};
  const out: Record<string, PrSize> = {};
  refs.forEach((ref, i) => {
    const node: unknown = data[`p${i}`];
    const pr: unknown = isRecord(node) ? node.pullRequest : null;
    if (!isRecord(pr)) return;
    out[sizeKey(ref)] = { additions: int(pr.additions), deletions: int(pr.deletions), changedFiles: int(pr.changedFiles) };
  });
  return out;
}

/** Build one batched GraphQL query aliasing each ref's state as `p<index>`. */
export function buildStatesQuery(refs: readonly PrSizeRef[]): string {
  const parts: string[] = refs.map((r, i) =>
    `p${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.repo)}) ` +
    `{ pullRequest(number: ${r.number}) { state } }`);
  return `query {\n${parts.join("\n")}\n}`;
}

/** Map a batched-states GraphQL response back to a {@link sizeKey}-keyed record. */
export function parseStates(rawJson: string, refs: readonly PrSizeRef[]): Record<string, PrState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {};
  }
  const data: Record<string, unknown> = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : {};
  const out: Record<string, PrState> = {};
  refs.forEach((ref, i) => {
    const node: unknown = data[`p${i}`];
    const pr: unknown = isRecord(node) ? node.pullRequest : null;
    if (!isRecord(pr)) return;
    out[sizeKey(ref)] = toPrState(pr.state);
  });
  return out;
}

/**
 * Parse a `gh search prs --json` array into typed summaries, each tagged with a
 * single relationship. Owner/repo/number are derived from the item's URL; items
 * without a valid PR URL are skipped rather than throwing.
 */
export function toMyPrs(rawJson: string, relationship: PrRelationship): MyPrSummary[] {
  const parsed: unknown = JSON.parse(rawJson);
  const items: unknown[] = Array.isArray(parsed) ? parsed : [];
  const out: MyPrSummary[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) continue;
    const url: string = str(raw.url);
    const ref = tryParse(url);
    if (!ref) continue;
    const author: Record<string, unknown> = isRecord(raw.author) ? raw.author : {};
    out.push({
      owner: ref.owner,
      repo: ref.repo,
      number: ref.number,
      title: str(raw.title),
      url,
      author: str(author.login),
      isDraft: raw.isDraft === true,
      updatedAtIso: str(raw.updatedAt),
      createdAtIso: str(raw.createdAt),
      relationships: [relationship],
    });
  }
  return out;
}

/** Parse a PR URL, returning null instead of throwing on a non-PR URL. */
function tryParse(url: string): { owner: string; repo: string; number: number } | null {
  try {
    return parsePrUrl(url);
  } catch {
    return null;
  }
}

/**
 * Merge per-relationship result groups into one list: deduped by URL, with each
 * PR's relationships unioned into canonical order and the list sorted
 * newest-updated first.
 */
export function mergePrGroups(groups: MyPrSummary[][]): MyPrSummary[] {
  const byUrl = new Map<string, MyPrSummary>();
  for (const group of groups) {
    for (const pr of group) {
      const existing = byUrl.get(pr.url);
      if (!existing) {
        byUrl.set(pr.url, { ...pr, relationships: [...pr.relationships] });
        continue;
      }
      const rels = new Set<PrRelationship>([...existing.relationships, ...pr.relationships]);
      existing.relationships = RELATION_ORDER.filter((r) => rels.has(r));
    }
  }
  return [...byUrl.values()].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
}

/** Create a {@link GhSearchService}. */
export function createGhSearchService(runner: CommandRunner = bunRunner): GhSearchService {
  async function search(relationship: PrRelationship): Promise<MyPrSummary[]> {
    const res = await runner.run("gh", [
      "search", "prs", RELATION_FLAG[relationship],
      "--state=open", "--json", JSON_FIELDS, "--limit", "100",
    ]);
    if (res.exitCode !== 0) {
      throw new Error(`gh search prs failed (${res.exitCode}): ${res.stderr.trim()}`);
    }
    return toMyPrs(res.stdout, relationship);
  }

  return {
    async listMyPrs(): Promise<MyPrSummary[]> {
      const groups = await Promise.all(RELATION_ORDER.map(search));
      return mergePrGroups(groups);
    },
    async prSizes(refs: readonly PrSizeRef[]): Promise<Record<string, PrSize>> {
      if (refs.length === 0) return {};
      const res = await runner.run("gh", ["api", "graphql", "-f", `query=${buildSizesQuery(refs)}`]);
      if (res.exitCode !== 0) {
        throw new Error(`gh api graphql failed (${res.exitCode}): ${res.stderr.trim()}`);
      }
      return parseSizes(res.stdout, refs);
    },
    async prStates(refs: readonly PrSizeRef[]): Promise<Record<string, PrState>> {
      if (refs.length === 0) return {};
      const res = await runner.run("gh", ["api", "graphql", "-f", `query=${buildStatesQuery(refs)}`]);
      if (res.exitCode !== 0) {
        throw new Error(`gh api graphql failed (${res.exitCode}): ${res.stderr.trim()}`);
      }
      return parseStates(res.stdout, refs);
    },
  };
}
