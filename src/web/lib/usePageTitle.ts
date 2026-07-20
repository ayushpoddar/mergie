import { useEffect } from "react";

/** Base title used when no PR-specific title is set. */
const BASE_TITLE = "mergie";

/**
 * Set the browser tab title, restoring the base title on unmount. A null/empty
 * value leaves the base title in place (e.g. while data is still loading).
 */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title && title.length > 0 ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [title]);
}
