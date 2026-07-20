import type { FileView } from "@/daemon/reviewService.ts";

/** How much of the on-screen range has been reviewed, counted in hunks. */
export interface ReviewProgress {
  /** Number of hunks marked viewed. */
  viewed: number;
  /** Total number of hunks in the range (lock/generated files included). */
  total: number;
}

/**
 * Count viewed hunks against every hunk in the given file list. Pure — does not
 * mutate its input. Callers pass the full, unfiltered range file list so the
 * total reflects the whole on-screen range regardless of visibility toggles.
 */
export function reviewProgress(files: readonly FileView[]): ReviewProgress {
  let viewed = 0;
  let total = 0;
  for (const file of files) {
    for (const hunk of file.hunks) {
      total += 1;
      if (hunk.viewed) viewed += 1;
    }
  }
  return { viewed, total };
}
