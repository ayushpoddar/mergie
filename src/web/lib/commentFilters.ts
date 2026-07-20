import type { AllCommentEntry } from "@/daemon/allComments.ts";

/** Author filter: everyone, only mine, or only other people's. */
export type AuthorFilter = "all" | "mine" | "others";

/**
 * Source filter for the All-comments view. A comment posted from mergie is a
 * GitHub comment, so it falls under `github` (never `local`); `local` is only
 * never-posted drafts.
 */
export type SourceFilter = "all" | "local" | "github";

/** The active filters on the All-comments view. */
export interface CommentFilters {
  /** Filter by authorship. */
  author: AuthorFilter;
  /** Filter by origin. */
  source: SourceFilter;
  /** File path to restrict to; empty string means all files. */
  file: string;
}

/**
 * Filter unified comment entries by author, source, and file. Pure — returns a
 * new array and never mutates its input.
 */
export function filterAllComments(entries: AllCommentEntry[], filters: CommentFilters): AllCommentEntry[] {
  return entries.filter((e) => {
    if (filters.author === "mine" && !e.mine) return false;
    if (filters.author === "others" && e.mine) return false;
    if (filters.source === "local" && e.origin !== "local") return false;
    if (filters.source === "github" && e.origin === "local") return false;
    if (filters.file !== "" && e.path !== filters.file) return false;
    return true;
  });
}
