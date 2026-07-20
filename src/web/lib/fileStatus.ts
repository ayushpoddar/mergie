import type { FileStatus } from "@/domain/diff.ts";

/**
 * The visual variant class for a file's diff status, used to colour the file
 * tree's status icon. `renamed` shares the neutral "modified" treatment since a
 * rename is a content change rather than an add/remove.
 */
export function fileStatusClass(status: FileStatus): "added" | "deleted" | "modified" {
  if (status === "added") return "added";
  if (status === "deleted") return "deleted";
  return "modified";
}
