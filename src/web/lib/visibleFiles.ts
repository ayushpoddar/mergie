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
 * Compute the files to render given the visibility toggles. This drives BOTH
 * the main diff area and the sidebar list, so the two never diverge. The file
 * search query is applied separately ({@link searchFiles}) so that typing in
 * the filter narrows only the sidebar, not the diff. Pure — does not mutate its
 * inputs.
 *
 * @param files   The full file list for the range.
 * @param toggles Active visibility toggles.
 * @param reveal  Hunk hashes to always show even when a toggle would hide them
 *                (used to jump to a comment on a toggled-away hunk without
 *                flipping the toggle). Defaults to none.
 */
export function visibleFiles(
  files: readonly FileView[],
  toggles: VisibilityToggles,
  reveal: ReadonlySet<string> = new Set(),
): FileView[] {
  const result: FileView[] = [];
  for (const file of files) {
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

/**
 * Narrow a file list to the fuzzy-search query, ranked by match quality. Used
 * for the sidebar file list only. An empty query returns every file in its
 * original order. Pure — does not mutate its inputs.
 */
export function searchFiles(files: readonly FileView[], query: string): FileView[] {
  if (query.length === 0) return [...files];
  const ranked: string[] = fuzzyFilter(query, files.map((f) => f.newPath));
  const byPath = new Map(files.map((f) => [f.newPath, f]));
  return ranked.map((path) => byPath.get(path)).filter((f): f is FileView => f !== undefined);
}
