import { bunRunner, type CommandRunner } from "./exec.ts";
import { parsePrUrl } from "@/domain/url.ts";

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
  /** All relationships the viewer has to this PR, in canonical order. */
  relationships: PrRelationship[];
}

/** Service for listing the viewer's open PRs via the `gh` CLI. */
export interface GhSearchService {
  /** Open PRs authored by, assigned to, or review-requested from the viewer. */
  listMyPrs(): Promise<MyPrSummary[]>;
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
const JSON_FIELDS = "number,title,url,author,isDraft,updatedAt";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
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
  };
}
