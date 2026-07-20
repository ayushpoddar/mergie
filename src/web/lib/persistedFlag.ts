import { useState } from "react";

/**
 * The subset of the browser `Storage` API this module needs. Declared as an
 * interface so tests can supply an in-memory store; `window.localStorage`
 * satisfies it structurally.
 */
export interface FlagStore {
  /** Read a stored string value, or `null` if absent. */
  getItem(key: string): string | null;
  /** Persist a string value. */
  setItem(key: string, value: string): void;
}

/**
 * Read a persisted boolean flag. Only the exact strings `"true"`/`"false"` are
 * recognised; anything absent or malformed returns `fallback`.
 */
export function readFlag(store: FlagStore, key: string, fallback: boolean): boolean {
  const raw: string | null = store.getItem(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

/** Persist a boolean flag. */
export function writeFlag(store: FlagStore, key: string, value: boolean): void {
  store.setItem(key, value ? "true" : "false");
}

/**
 * React hook: a boolean flag persisted in local storage under `key`, so it
 * survives reloads and navigation. Used for global layout preferences (e.g.
 * whether the left sidebar is collapsed) that are not scoped to a single PR.
 */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [flag, setFlag] = useState<boolean>(() => readFlag(window.localStorage, key, fallback));
  const update = (value: boolean): void => {
    writeFlag(window.localStorage, key, value);
    setFlag(value);
  };
  return [flag, update];
}
