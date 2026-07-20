/**
 * A parsed reference to a GitHub pull request, extracted from a PR URL.
 */
export interface PullRequestRef {
  /** Git host, e.g. "github.com". */
  host: string;
  /** Repository owner / organisation, e.g. "withastro". */
  owner: string;
  /** Repository name, e.g. "astro". */
  repo: string;
  /** Pull request number (positive integer). */
  number: number;
}

/**
 * Parse a GitHub pull-request URL into its components.
 *
 * Tolerant of trailing segments (`/changes`, `/files`, a trailing slash) and
 * of URL fragments/queries — only the `owner/repo/pull/<number>` portion is
 * significant.
 *
 * @param input A pull-request URL such as
 *   `https://github.com/withastro/astro/pull/17360/changes`.
 * @returns The parsed {@link PullRequestRef}.
 * @throws If the input is not a URL, or is not a `/pull/<number>` URL.
 */
export function parsePrUrl(input: string): PullRequestRef {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid PR URL: ${input}`);
  }

  const segments: string[] = url.pathname.split("/").filter(Boolean);
  const [owner, repo, kind, rawNumber] = segments;

  if (!owner || !repo || kind !== "pull" || !rawNumber) {
    throw new Error(`Not a pull-request URL: ${input}`);
  }
  if (!/^\d+$/.test(rawNumber)) {
    throw new Error(`Invalid PR number in URL: ${input}`);
  }
  const number: number = Number.parseInt(rawNumber, 10);
  if (number <= 0) {
    throw new Error(`Invalid PR number in URL: ${input}`);
  }

  return { host: url.hostname, owner, repo, number };
}
