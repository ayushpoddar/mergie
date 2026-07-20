import { useState } from "react";
import { trpc } from "../trpc.ts";
import { parsePrUrl } from "@/domain/url.ts";
import { filterPrs } from "@/web/lib/filterPrs.ts";
import { excludeLoaded } from "@/web/lib/prPickerModel.ts";
import { RefreshIcon, SearchIcon, InboxIcon } from "./Icons.tsx";
import type { MyPrSummary, PrRelationship } from "@/services/ghSearch.ts";
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

/**
 * The PR picker: a custom-URL input, a text filter, the PRs already loaded in
 * mergie ("Recently reviewed"), and the viewer's open PRs from GitHub. Used
 * both as the home screen and inside the in-review "Switch PR" overlay.
 */
export function PrPicker(props: { currentPrId?: string }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const health = trpc.health.useQuery();
  const mine = trpc.listMyPrs.useQuery(undefined, { staleTime: Infinity, retry: false });

  const loaded: LoadedPr[] = health.data?.prs ?? [];
  const loadedShown: LoadedPr[] = filterPrs(query, loaded);
  const searchShown: MyPrSummary[] = filterPrs(query, excludeLoaded(mine.data ?? [], loaded));

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
        <GithubResults query={query} loading={mine.isLoading} error={mine.error?.message ?? null} prs={searchShown} />
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
      {props.prs.map((p) => <GithubRow key={p.url} pr={p} />)}
    </ul>
  );
}

/** One already-loaded PR row. */
function LoadedRow(props: { pr: LoadedPr; isCurrent: boolean }): React.JSX.Element {
  const { pr, isCurrent } = props;
  const meta = (
    <span className="pr-card-meta">
      <span className="pr-card-repo">{pr.owner}/{pr.repo}</span>
      <span className="pr-card-num">#{pr.number}</span>
      {isCurrent && <span className="pr-chip pr-chip-current">Reviewing now</span>}
    </span>
  );
  if (isCurrent) {
    return <li><div className="pr-card pr-card-current">{meta}<span className="pr-card-title">{pr.title}</span></div></li>;
  }
  return (
    <li>
      <a className="pr-card" href={loadedHref(pr.id)}>
        {meta}
        <span className="pr-card-title">{pr.title}</span>
      </a>
    </li>
  );
}

/** One GitHub-search PR row, tagged with the viewer's relationship(s). */
function GithubRow(props: { pr: MyPrSummary }): React.JSX.Element {
  const { pr } = props;
  return (
    <li>
      <a className="pr-card" href={loadHref(pr.url)}>
        <span className="pr-card-meta">
          <span className="pr-card-repo">{pr.owner}/{pr.repo}</span>
          <span className="pr-card-num">#{pr.number}</span>
          {pr.isDraft && <span className="pr-chip pr-chip-draft">Draft</span>}
          {pr.relationships.map((r) => (
            <span key={r} className="pr-chip">{RELATION_LABEL[r]}</span>
          ))}
        </span>
        <span className="pr-card-title">{pr.title}</span>
        {pr.author && <span className="pr-card-author">by {pr.author}</span>}
      </a>
    </li>
  );
}
