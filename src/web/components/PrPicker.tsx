import { useEffect, useState } from "react";
import { trpc } from "../trpc.ts";
import { parsePrUrl } from "@/domain/url.ts";
import { filterPrs } from "@/web/lib/filterPrs.ts";
import { excludeLoaded } from "@/web/lib/prPickerModel.ts";
import { relativeTime } from "@/web/lib/relativeTime.ts";
import { RefreshIcon, SearchIcon, InboxIcon } from "./Icons.tsx";
import { PrStatusBadge } from "./PrStatusBadge.tsx";
import type { MyPrSummary, PrRelationship, PrSize } from "@/services/ghSearch.ts";
import type { LoadedPr } from "@/daemon/registry.ts";

/** Human labels for each PR relationship, shown as row chips. */
const RELATION_LABEL: Record<PrRelationship, string> = {
  authored: "Created by me",
  assigned: "Assigned",
  "review-requested": "Review requested",
};

/** Navigate the browser, letting App re-route on the new query string. */
function go(href: string): void {
  window.location.assign(href);
}

/** Deep-link for an already-loaded PR (opens straight into review). */
function loadedHref(id: string): string {
  return `/?pr=${encodeURIComponent(id)}`;
}

/** Deep-link that routes through the loading gate for a not-yet-loaded PR. */
function loadHref(url: string): string {
  return `/?load=${encodeURIComponent(url)}`;
}

/** GitHub's per-user avatar image URL (no API call needed). */
function avatarUrl(login: string): string {
  return `https://github.com/${encodeURIComponent(login)}.png?size=40`;
}

/** Map key matching the daemon's `sizeKey` (owner/repo/number). */
function sizeKey(p: { owner: string; repo: string; number: number }): string {
  return `${p.owner}/${p.repo}/${p.number}`;
}

/**
 * The PR picker: a custom-URL input, a text filter, the PRs already loaded in
 * mergie ("Recently reviewed"), and the viewer's open PRs from GitHub. Used
 * both as the home screen and inside the in-review "Switch PR" overlay.
 */
export function PrPicker(props: { currentPrId?: string }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const health = trpc.health.useQuery();
  const mine = trpc.listMyPrs.useQuery(undefined, { staleTime: Infinity, retry: false });

  // Re-check every loaded PR's live status once when the picker opens; the
  // daemon folds the fresh states back into the registry, so we refresh the
  // loaded-PR list to reflect any that have since merged or closed.
  const statuses = trpc.prStates.useQuery(undefined, { refetchOnMount: "always", staleTime: 0, retry: false });
  useEffect(() => {
    if (statuses.data) void utils.health.invalidate();
  }, [statuses.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const loaded: LoadedPr[] = health.data?.prs ?? [];
  const loadedShown: LoadedPr[] = filterPrs(query, loaded);
  const githubAll: MyPrSummary[] = excludeLoaded(mine.data ?? [], loaded);
  const searchShown: MyPrSummary[] = filterPrs(query, githubAll);

  // One batched size lookup for the whole GitHub list (not the filtered subset),
  // so typing in the filter never re-fetches sizes.
  const sizeRefs = githubAll.map((p) => ({ owner: p.owner, repo: p.repo, number: p.number }));
  const sizes = trpc.prSizes.useQuery({ refs: sizeRefs }, { enabled: sizeRefs.length > 0, staleTime: Infinity, retry: false });

  return (
    <div className="picker">
      <UrlForm />
      <div className="picker-filter">
        <SearchIcon size={14} />
        <input
          type="text"
          className="picker-filter-input"
          placeholder="Filter by repo, owner, title, or #number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter pull requests"
        />
      </div>

      {loadedShown.length > 0 && (
        <section className="picker-section">
          <h3 className="picker-section-title">Recently reviewed</h3>
          <ul className="pr-cards">
            {loadedShown.map((p) => (
              <LoadedRow key={p.id} pr={p} isCurrent={p.id === props.currentPrId} />
            ))}
          </ul>
        </section>
      )}

      <section className="picker-section">
        <div className="picker-section-head">
          <h3 className="picker-section-title">From GitHub</h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void mine.refetch()}
            disabled={mine.isFetching}
            title="Refresh the list from GitHub"
          >
            <RefreshIcon size={13} /> {mine.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <GithubResults
          query={query}
          loading={mine.isLoading}
          error={mine.error?.message ?? null}
          prs={searchShown}
          sizes={sizes.data ?? {}}
          sizesLoading={sizes.isLoading}
        />
      </section>
    </div>
  );
}

/** The "load a PR by URL" input; validates the URL before navigating. */
function UrlForm(): React.JSX.Element {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed: string = url.trim();
    if (trimmed.length === 0) return;
    try {
      parsePrUrl(trimmed);
    } catch {
      setError("Enter a GitHub pull-request URL, e.g. https://github.com/owner/repo/pull/123");
      return;
    }
    go(loadHref(trimmed));
  };

  return (
    <form className="picker-url" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input
        type="text"
        className="picker-url-input"
        placeholder="Paste a pull-request URL…"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(null); }}
        aria-label="Pull request URL"
      />
      <button type="submit" className="btn btn-accent" disabled={url.trim().length === 0}>Open</button>
      {error && <p className="picker-url-error" role="alert">{error}</p>}
    </form>
  );
}

/** Render the GitHub-search section body: spinner, error, empty, or rows. */
function GithubResults(props: {
  query: string;
  loading: boolean;
  error: string | null;
  prs: MyPrSummary[];
  sizes: Record<string, PrSize>;
  sizesLoading: boolean;
}): React.JSX.Element {
  if (props.loading) {
    return <div className="picker-status"><span className="chat-spinner" aria-hidden="true" /> Finding your pull requests…</div>;
  }
  if (props.error !== null) {
    return (
      <div className="picker-status picker-error" role="alert">
        Couldn’t reach GitHub: {props.error}
      </div>
    );
  }
  if (props.prs.length === 0) {
    return (
      <div className="empty-state">
        <InboxIcon size={32} />
        <p className="empty-state-title">{props.query ? "No matching pull requests" : "No open pull requests"}</p>
        <p className="empty-state-hint">
          {props.query ? "Try a different filter, or paste a URL above." : "PRs you created, are assigned to, or are asked to review show up here."}
        </p>
      </div>
    );
  }
  return (
    <ul className="pr-cards">
      {props.prs.map((p) => (
        <GithubRow key={p.url} pr={p} size={props.sizes[sizeKey(p)]} sizeLoading={props.sizesLoading} />
      ))}
    </ul>
  );
}

/** The PR author's avatar, or nothing when the login is unknown. */
function Avatar(props: { login: string }): React.JSX.Element | null {
  if (!props.login) return null;
  return <img className="pr-card-avatar" src={avatarUrl(props.login)} alt="" width={20} height={20} loading="lazy" />;
}

/** A diff-size stat ("+120 −8 · 5 files"), a skeleton while loading, or nothing. */
function SizeStat(props: { size: PrSize | undefined; loading: boolean }): React.JSX.Element | null {
  if (props.size) {
    return (
      <span className="pr-stat pr-size">
        <span className="add">+{props.size.additions.toLocaleString()}</span>{" "}
        <span className="del">−{props.size.deletions.toLocaleString()}</span>
        {" · "}{props.size.changedFiles} {props.size.changedFiles === 1 ? "file" : "files"}
      </span>
    );
  }
  if (props.loading) return <span className="pr-stat pr-skeleton" aria-hidden="true" />;
  return null;
}

/** One already-loaded PR row (rich metadata + live review progress). */
function LoadedRow(props: { pr: LoadedPr; isCurrent: boolean }): React.JSX.Element {
  const { pr, isCurrent } = props;
  const now = Date.now();
  const progress = trpc.prProgress.useQuery({ id: pr.id }, { staleTime: 30_000, retry: false });
  const inner = (
    <>
      <span className="pr-card-meta">
        <Avatar login={pr.authorLogin} />
        <span className="pr-card-repo">{pr.owner}/{pr.repo}</span>
        <span className="pr-card-num">#{pr.number}</span>
        <PrStatusBadge state={pr.state} />
        {isCurrent && <span className="pr-chip pr-chip-current">Reviewing now</span>}
      </span>
      <span className="pr-card-title">{pr.title}</span>
      <span className="pr-card-stats">
        <span className="pr-stat pr-branch" title={`${pr.baseRef} ← ${pr.headRef}`}>{pr.baseRef} ← {pr.headRef}</span>
        <span className="pr-stat">{pr.commitCount} {pr.commitCount === 1 ? "commit" : "commits"}</span>
        <SizeStat size={{ additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changedFiles }} loading={false} />
        {pr.updatedAtIso && <span className="pr-stat">updated {relativeTime(pr.updatedAtIso, now)}</span>}
        {progress.data && progress.data.total > 0 && (
          <span className="pr-stat pr-progress">{progress.data.viewed}/{progress.data.total} hunks</span>
        )}
        {progress.isLoading && <span className="pr-stat pr-skeleton" aria-hidden="true" />}
      </span>
    </>
  );
  if (isCurrent) return <li><div className="pr-card pr-card-current">{inner}</div></li>;
  return <li><a className="pr-card" href={loadedHref(pr.id)}>{inner}</a></li>;
}

/** One GitHub-search PR row, tagged with the viewer's relationship(s). */
function GithubRow(props: { pr: MyPrSummary; size: PrSize | undefined; sizeLoading: boolean }): React.JSX.Element {
  const { pr, size, sizeLoading } = props;
  const now = Date.now();
  return (
    <li>
      <a className="pr-card" href={loadHref(pr.url)}>
        <span className="pr-card-meta">
          <Avatar login={pr.author} />
          <span className="pr-card-repo">{pr.owner}/{pr.repo}</span>
          <span className="pr-card-num">#{pr.number}</span>
          {pr.isDraft && <span className="pr-chip pr-chip-draft">Draft</span>}
          {pr.relationships.map((r) => (
            <span key={r} className="pr-chip">{RELATION_LABEL[r]}</span>
          ))}
        </span>
        <span className="pr-card-title">{pr.title}</span>
        <span className="pr-card-stats">
          {pr.author && <span className="pr-stat">{pr.author}</span>}
          {pr.updatedAtIso && <span className="pr-stat">updated {relativeTime(pr.updatedAtIso, now)}</span>}
          {pr.createdAtIso && <span className="pr-stat">opened {relativeTime(pr.createdAtIso, now)}</span>}
          <SizeStat size={size} loading={sizeLoading} />
        </span>
      </a>
    </li>
  );
}
