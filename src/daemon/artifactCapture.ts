import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ArtifactInput } from "@/db/repositories/artifacts.ts";

/** List every file under `dir` recursively, as `/`-joined relative paths. */
export function listRelFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs: string = join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(relative(dir, abs));
    }
  };
  walk(dir);
  return out;
}

/** Fixed context for a batch of captured artifacts. */
export interface CaptureContext {
  /** Range baseline SHA the artifacts belong to. */
  rangeStartSha: string;
  /** Range end SHA the artifacts belong to. */
  rangeEndSha: string;
  /** The session that produced them. */
  sessionId: number;
  /** Creation timestamp (ms). */
  now: number;
}

/**
 * Compute the artifact rows for files that appeared in `dir` since the `before`
 * snapshot of relative paths. The title defaults to the file's relative path.
 */
export function newArtifacts(dir: string, before: Set<string>, ctx: CaptureContext): ArtifactInput[] {
  return listRelFiles(dir)
    .filter((rel) => !before.has(rel))
    .map((rel) => ({
      rangeStartSha: ctx.rangeStartSha,
      rangeEndSha: ctx.rangeEndSha,
      sessionId: ctx.sessionId,
      relPath: rel,
      title: rel,
      createdAt: ctx.now,
    }));
}
