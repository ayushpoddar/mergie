import { useState } from "react";
import type { VisibilityToggles } from "./visibleFiles.ts";

/** Default visibility toggles: everything shown (all off). */
export const DEFAULT_TOGGLES: VisibilityToggles = {
  hideViewedHunks: false,
  hideViewedFiles: false,
  hideLockFiles: false,
};

/**
 * The subset of the browser `Storage` API this module needs. Declared as an
 * interface so tests can supply an in-memory store; `window.localStorage`
 * satisfies it structurally.
 */
export interface ToggleStore {
  /** Read a stored string value, or `null` if absent. */
  getItem(key: string): string | null;
  /** Persist a string value. */
  setItem(key: string, value: string): void;
}

/** Local-storage key holding the toggle state for one PR. */
export function toggleStorageKey(prId: string): string {
  return `mergie:toggles:${prId}`;
}

/**
 * Local-storage key holding the per-PR "hide whitespace-only changes" flag.
 * Separate from {@link toggleStorageKey} because it drives what the server
 * diffs (an `--ignore-all-space` re-diff), not client-side file visibility.
 */
export function hideWhitespaceStorageKey(prId: string): string {
  return `mergie:hideWhitespace:${prId}`;
}

/**
 * Read the persisted toggles for a PR, coercing each known key to a boolean
 * against {@link DEFAULT_TOGGLES}. Returns the defaults when nothing is stored
 * or the stored value is malformed.
 */
export function readToggles(store: ToggleStore, prId: string): VisibilityToggles {
  const raw: string | null = store.getItem(toggleStorageKey(prId));
  if (raw === null) return { ...DEFAULT_TOGGLES };
  const parsed: Record<string, unknown> | null = safeParse(raw);
  if (parsed === null) return { ...DEFAULT_TOGGLES };
  return {
    hideViewedHunks: parsed.hideViewedHunks === true,
    hideViewedFiles: parsed.hideViewedFiles === true,
    hideLockFiles: parsed.hideLockFiles === true,
  };
}

/** Persist the toggles for a PR. */
export function writeToggles(store: ToggleStore, prId: string, toggles: VisibilityToggles): void {
  store.setItem(toggleStorageKey(prId), JSON.stringify(toggles));
}

/**
 * React hook: toggle state that persists per-PR in local storage, so it
 * survives full-page navigation (e.g. to the AI-reviews view) and browser
 * restarts.
 */
export function usePersistedToggles(prId: string): [VisibilityToggles, (t: VisibilityToggles) => void] {
  const [toggles, setToggles] = useState<VisibilityToggles>(() => readToggles(window.localStorage, prId));
  const update = (next: VisibilityToggles): void => {
    writeToggles(window.localStorage, prId, next);
    setToggles(next);
  };
  return [toggles, update];
}

/** Parse JSON into a plain object, or `null` on any failure / non-object. */
function safeParse(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null ? { ...value } : null;
  } catch {
    return null;
  }
}
