import { fuzzyFilter } from "@/domain/fuzzy.ts";
import type { FileView } from "@/daemon/reviewService.ts";

/** Which categories the visibility toggles hide. */
export interface VisibilityToggles {
  /** Hide hunks already marked viewed. */
  hideViewedHunks: boolean;
  /** Hide files that are fully viewed. */
  hideViewedFiles: boolean;
  /** Hide lock/generated files. */
  hideLockFiles: boolean;
}

/**
 * Compute the files to render given the fuzzy search query and the visibility
 * toggles. Pure — does not mutate its inputs.
 *
 * @param files   The full file list for the range.
 * @param query   Fuzzy search text over file paths (empty = no filter).
 * @param toggles Active visibility toggles.
 * @param reveal  Hunk hashes to always show even when a toggle would hide them
 *                (used to jump to a comment on a toggled-away hunk without
 *                flipping the toggle). Defaults to none.
 */
export function visibleFiles(
  files: readonly FileView[],
  query: string,
  toggles: VisibilityToggles,
  reveal: ReadonlySet<string> = new Set(),
): FileView[] {
  const ordered: FileView[] = applyQuery(files, query);
  const result: FileView[] = [];
  for (const file of ordered) {
    const fileRevealed: boolean = file.hunks.some((h) => reveal.has(h.hash));
    if (toggles.hideLockFiles && file.isLockfile && !fileRevealed) continue;
    if (toggles.hideViewedFiles && file.viewed && !fileRevealed) continue;
    const hunks = toggles.hideViewedHunks
      ? file.hunks.filter((h) => !h.viewed || reveal.has(h.hash))
      : file.hunks;
    if (toggles.hideViewedHunks && hunks.length === 0) continue;
    result.push({ ...file, hunks });
  }
  return result;
}

/** Order files by fuzzy match when a query is present; otherwise keep order. */
function applyQuery(files: readonly FileView[], query: string): FileView[] {
  if (query.length === 0) return [...files];
  const ranked: string[] = fuzzyFilter(query, files.map((f) => f.newPath));
  const byPath = new Map(files.map((f) => [f.newPath, f]));
  return ranked.map((path) => byPath.get(path)).filter((f): f is FileView => f !== undefined);
}
