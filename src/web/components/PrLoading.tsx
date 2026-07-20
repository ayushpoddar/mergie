import { useEffect, useRef } from "react";
import { trpc } from "../trpc.ts";

/**
 * The loading gate shown after picking a not-yet-loaded PR. Fires `loadPr`
 * once on mount (idempotent server-side) and, once it resolves, replaces the
 * URL with the review deep-link so App routes into the review screen. Failures
 * are shown here with a way back to the picker.
 */
export function PrLoading(props: { url: string }): React.JSX.Element {
  const load = trpc.loadPr.useMutation();
  const started = useRef(false);
  const { mutate } = load;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate(
      { url: props.url },
      { onSuccess: (pr) => window.location.replace(`/?pr=${encodeURIComponent(pr.id)}`) },
    );
  }, [mutate, props.url]);

  if (load.isError) {
    return (
      <main className="landing">
        <div className="pr-loading-fail" role="alert">
          <p className="empty-state-title">Couldn’t load that pull request</p>
          <p className="empty-state-hint">{load.error.message}</p>
          <a className="btn" href="/">Back to pull requests</a>
        </div>
      </main>
    );
  }

  return (
    <main className="landing">
      <div className="pr-loading">
        <span className="chat-spinner" aria-hidden="true" />
        <p className="empty-state-title">Loading pull request…</p>
        <p className="empty-state-hint">Fetching from GitHub and preparing the diff.</p>
      </div>
    </main>
  );
}
