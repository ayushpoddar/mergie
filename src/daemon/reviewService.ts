import { isLockfile } from "@/domain/lockfiles.ts";
import { commentAnchorHash, type DiffSide } from "@/domain/hash.ts";
import { changedLineCount, parseUnifiedDiff, type DiffLine, type FileStatus } from "@/domain/diff.ts";
import { parseWordDiff, withWordChanges, type FileWordChanges } from "@/domain/wordDiff.ts";
import type { CommentKind, CommentRow } from "@/db/repositories/comments.ts";
import type { GithubThread } from "./githubThreads.ts";

/** A comment resolved to a position within a hunk for rendering. */
export interface AnchoredComment {
  /** Comment id. */
  id: number;
  /** Markdown body. */
  body: string;
  /** Which side the comment is on. */
  side: DiffSide;
  /** Whether it targets a line range or the whole hunk. */
  kind: CommentKind;
  /** Index into `hunk.lines` the comment sits under; -1 for a whole-hunk comment. */
  lineIndex: number;
  /** Creation timestamp (ms). */
  createdAt: number;
  /** Last-updated timestamp (ms). */
  updatedAt: number;
  /** GitHub URL if this comment was posted; null otherwise. */
  githubUrl: string | null;
}

/** A GitHub thread resolved to a position within a hunk for rendering. */
export interface AnchoredGithubThread extends GithubThread {
  /** Index into `hunk.lines` the thread sits under. */
  lineIndex: number;
}

/** A hunk as presented to the UI for a range. */
export interface HunkView {
  /** Content hash identifying the hunk. */
  hash: string;
  /** Raw hunk header. */
  header: string;
  /** Base-side start line. */
  oldStart: number;
  /** Base-side line count. */
  oldLines: number;
  /** Head-side start line. */
  newStart: number;
  /** Head-side line count. */
  newLines: number;
  /** The hunk's lines. */
  lines: DiffLine[];
  /** Changed lines in the hunk (additions + deletions, context excluded). */
  changedLines: number;
  /**
   * True when the hunk meets the large-diff threshold and should render behind a
   * "Load diff" button by default. False when the threshold is 0 (disabled).
   */
  isLarge: boolean;
  /** Whether this hunk is marked viewed. */
  viewed: boolean;
  /** Comments anchored within this hunk. */
  comments: AnchoredComment[];
  /** Synced GitHub inline threads anchored within this hunk. */
  githubThreads: AnchoredGithubThread[];
}

/** A file as presented to the UI for a range. */
export interface FileView {
  /** Base-side path. */
  oldPath: string;
  /** Head-side path. */
  newPath: string;
  /** How the file changed. */
  status: FileStatus;
  /** True for binary files (no textual hunks). */
  isBinary: boolean;
  /** True if the file matches a lock/generated-file pattern. */
  isLockfile: boolean;
  /** True when the file has hunks and all are viewed. */
  viewed: boolean;
  /** The file's hunks. */
  hunks: HunkView[];
}

/** Collaborators needed to assemble a range view. */
export interface BuildRangeDeps {
  /** Produce the raw unified diff between two commits. */
  rawDiff: (startSha: string, endSha: string) => Promise<string>;
  /**
   * Produce the porcelain word-diff between two commits, for intra-line change
   * highlighting. Optional — when absent, lines carry no word-level ranges.
   */
  wordDiff?: (startSha: string, endSha: string) => Promise<string>;
  /** Whether a hunk hash is marked viewed. */
  isViewed: (hunkHash: string) => boolean;
  /** Lock/generated-file glob patterns. */
  lockfilePatterns: readonly string[];
  /**
   * Changed-line count at or above which a hunk is marked large (collapsed
   * behind "Load diff"). 0 or omitted disables collapsing.
   */
  largeDiffThreshold?: number;
  /** All stored comments (attached to matching hunks/lines). */
  comments?: readonly CommentRow[];
  /** Synced GitHub threads (attached to matching hunks/lines). */
  githubThreads?: readonly GithubThread[];
}

/** Look up a file's word-diff changes by either its base or head path. */
class WordChangeIndex {
  private readonly byPath = new Map<string, FileWordChanges>();

  constructor(files: FileWordChanges[]) {
    for (const f of files) {
      this.byPath.set(f.newPath, f);
      this.byPath.set(f.oldPath, f);
    }
  }

  /** The changes for a file, matched on head path first then base path. */
  forFile(oldPath: string, newPath: string): FileWordChanges | undefined {
    return this.byPath.get(newPath) ?? this.byPath.get(oldPath);
  }
}

/**
 * Assemble the per-file, per-hunk view for a commit range: parse the diff,
 * annotate each hunk with viewed state + anchored comments, and each file with
 * its lock-file flag and auto-viewed status.
 */
export async function buildRangeView(
  deps: BuildRangeDeps,
  startSha: string,
  endSha: string,
): Promise<FileView[]> {
  const [raw, wordRaw] = await Promise.all([
    deps.rawDiff(startSha, endSha),
    deps.wordDiff ? deps.wordDiff(startSha, endSha) : Promise.resolve(""),
  ]);
  const wordChanges = new WordChangeIndex(parseWordDiff(wordRaw));
  const threads: readonly GithubThread[] = deps.githubThreads ?? [];
  // Drop local comments already represented by a synced thread (posted from mergie).
  const syncedRootIds = new Set<string>(threads.map((t) => t.root.githubId));
  const comments: readonly CommentRow[] = (deps.comments ?? []).filter(
    (c) => c.githubId === null || !syncedRootIds.has(c.githubId),
  );
  const threshold: number = deps.largeDiffThreshold ?? 0;
  return parseUnifiedDiff(raw).map((file) => {
    const fc = wordChanges.forFile(file.oldPath, file.newPath);
    const hunks: HunkView[] = file.hunks.map((h) => {
      const changedLines: number = changedLineCount(h.lines);
      return {
        hash: h.hash,
        header: h.header,
        oldStart: h.oldStart,
        oldLines: h.oldLines,
        newStart: h.newStart,
        newLines: h.newLines,
        lines: withWordChanges(h.lines, fc),
        changedLines,
        isLarge: threshold > 0 && changedLines >= threshold,
        viewed: deps.isViewed(h.hash),
        comments: anchorComments(file.newPath, h.hash, h.lines, comments),
        githubThreads: anchorGithubThreads(file.newPath, h.lines, threads),
      };
    });
    return {
      oldPath: file.oldPath,
      newPath: file.newPath,
      status: file.status,
      isBinary: file.isBinary,
      isLockfile: isLockfile(file.newPath, deps.lockfilePatterns),
      viewed: hunks.length > 0 && hunks.every((h) => h.viewed),
      hunks,
    };
  });
}

/** Map a stored comment to its anchored view form. */
function toAnchored(c: CommentRow, lineIndex: number): AnchoredComment {
  return {
    id: c.id, body: c.body, side: c.side, kind: c.kind, lineIndex,
    createdAt: c.createdAt, updatedAt: c.updatedAt, githubUrl: c.githubUrl,
  };
}

/**
 * Find the comments that anchor to a hunk: whole-hunk comments whose anchor is
 * the hunk hash, and line comments (single or multi-line) whose anchored text
 * matches a contiguous block of same-side lines.
 */
function anchorComments(
  path: string,
  hunkHash: string,
  lines: DiffLine[],
  comments: readonly CommentRow[],
): AnchoredComment[] {
  const out: AnchoredComment[] = [];
  for (const c of comments) {
    if (c.path !== path) continue;
    if (c.kind === "hunk") {
      if (c.anchorHash === hunkHash) out.push(toAnchored(c, -1));
      continue;
    }
    const span: number = c.startLine !== null && c.endLine !== null ? c.endLine - c.startLine + 1 : 1;
    const idx = findAnchorWindow(path, lines, c.side, span, c.anchorHash);
    if (idx !== null) out.push(toAnchored(c, idx));
  }
  return out;
}

/**
 * Attach GitHub threads to a hunk: a thread anchors where the hunk has a line,
 * on the thread's side, whose side-relative number equals the thread's line.
 * Threads without a matching line in this range are dropped (not shown).
 */
function anchorGithubThreads(
  path: string,
  lines: DiffLine[],
  threads: readonly GithubThread[],
): AnchoredGithubThread[] {
  const out: AnchoredGithubThread[] = [];
  for (const t of threads) {
    if (t.path !== path || t.line === null) continue;
    const lineIndex: number = lines.findIndex((l) => {
      const onSide = t.side === "RIGHT" ? l.kind !== "del" : l.kind !== "add";
      const no = t.side === "RIGHT" ? l.newNo : l.oldNo;
      return onSide && no === t.line;
    });
    if (lineIndex !== -1) out.push({ ...t, lineIndex });
  }
  return out;
}

/** Indices of lines that participate on a given diff side, in reading order. */
function sideLineIndices(lines: DiffLine[], side: DiffSide): number[] {
  const out: number[] = [];
  lines.forEach((line, i) => {
    const onSide = side === "RIGHT" ? line.kind === "add" || line.kind === "ctx" : line.kind === "del" || line.kind === "ctx";
    if (onSide) out.push(i);
  });
  return out;
}

/**
 * Locate a contiguous window of `span` same-side lines whose joined text hashes
 * to `anchorHash`. Returns the window's first `lines` index, or null.
 */
function findAnchorWindow(
  path: string,
  lines: DiffLine[],
  side: DiffSide,
  span: number,
  anchorHash: string,
): number | null {
  const sideIdx: number[] = sideLineIndices(lines, side);
  for (let s = 0; s + span <= sideIdx.length; s++) {
    const window: number[] = sideIdx.slice(s, s + span);
    const text: string = window.map((i) => lines[i]?.text ?? "").join("\n");
    if (commentAnchorHash(path, side, text) === anchorHash) return window[0] ?? null;
  }
  return null;
}
