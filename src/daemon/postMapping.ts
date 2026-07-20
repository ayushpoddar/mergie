import { commentAnchorHash, type DiffSide } from "@/domain/hash.ts";
import type { DiffLine } from "@/domain/diff.ts";
import type { PostCommentInput } from "@/services/github.ts";

/** A resolved line-number span on one diff side (both bounds inclusive). */
export interface LineSpan {
  /** First (smallest) 1-based line number on the side. */
  startNo: number;
  /** Last 1-based line number on the side. */
  endNo: number;
}

/** Indices of lines that participate on a given diff side, in reading order. */
function sideIndices(lines: DiffLine[], side: DiffSide): number[] {
  const out: number[] = [];
  lines.forEach((line, i) => {
    const onSide: boolean = side === "RIGHT"
      ? line.kind === "add" || line.kind === "ctx"
      : line.kind === "del" || line.kind === "ctx";
    if (onSide) out.push(i);
  });
  return out;
}

/** The side line number of a line (new-side for RIGHT, old-side for LEFT). */
function lineNo(line: DiffLine, side: DiffSide): number | undefined {
  return side === "RIGHT" ? line.newNo : line.oldNo;
}

/**
 * Locate a contiguous window of `span` same-side lines whose joined text hashes
 * to `anchorHash`, and return its first/last side line numbers — or null when
 * the block is not present on that side.
 */
export function locateLineComment(
  path: string,
  lines: DiffLine[],
  side: DiffSide,
  span: number,
  anchorHash: string,
): LineSpan | null {
  const idx: number[] = sideIndices(lines, side);
  for (let s = 0; s + span <= idx.length; s++) {
    const window: number[] = idx.slice(s, s + span);
    const text: string = window.map((i) => lines[i]?.text ?? "").join("\n");
    if (commentAnchorHash(path, side, text) !== anchorHash) continue;
    const startNo = lineNo(lines[window[0] ?? 0]!, side);
    const endNo = lineNo(lines[window[window.length - 1] ?? 0]!, side);
    if (startNo === undefined || endNo === undefined) return null;
    return { startNo, endNo };
  }
  return null;
}

/**
 * The side line-number span covering a hunk's changed lines (additions for
 * RIGHT, deletions for LEFT). Null when the hunk changes nothing on that side.
 */
export function hunkChangedSpan(lines: DiffLine[], side: DiffSide): LineSpan | null {
  const changedKind: DiffLine["kind"] = side === "RIGHT" ? "add" : "del";
  const nums: number[] = lines
    .filter((l) => l.kind === changedKind)
    .map((l) => lineNo(l, side))
    .filter((n): n is number => n !== undefined);
  if (nums.length === 0) return null;
  return { startNo: Math.min(...nums), endNo: Math.max(...nums) };
}

/** Fields needed to build a GitHub inline-comment post request. */
export interface ToPostInputArgs extends LineSpan {
  /** Repo-relative file path. */
  path: string;
  /** Diff side to post on. */
  side: DiffSide;
  /** Markdown body. */
  body: string;
  /** Commit SHA to anchor the comment to. */
  commitId: string;
}

/**
 * Build a {@link PostCommentInput}: a single-line comment when start and end
 * coincide, otherwise a multi-line span from `startNo` to `endNo`.
 */
export function toPostInput(args: ToPostInputArgs): PostCommentInput {
  const base: PostCommentInput = {
    body: args.body,
    commitId: args.commitId,
    path: args.path,
    side: args.side,
    line: args.endNo,
  };
  return args.startNo < args.endNo ? { ...base, startLine: args.startNo } : base;
}
