import { hunkHash } from "./hash.ts";

/** How a file was changed in a diff. */
export type FileStatus = "added" | "deleted" | "modified" | "renamed";

/** Whether a diff line is unchanged context, an addition, or a deletion. */
export type DiffLineKind = "ctx" | "add" | "del";

/** A half-open character range `[start, end)` within a line's text. */
export interface CharRange {
  /** 0-based index of the first changed character. */
  start: number;
  /** 0-based index one past the last changed character. */
  end: number;
}

/** A single line within a hunk. */
export interface DiffLine {
  /** Line kind. */
  kind: DiffLineKind;
  /** 1-based line number on the base (old) side; undefined for additions. */
  oldNo?: number;
  /** 1-based line number on the head (new) side; undefined for deletions. */
  newNo?: number;
  /** Line text without the leading +/-/space marker. */
  text: string;
  /**
   * Intra-line changed character ranges (from the word-diff pass), for
   * highlighting the exact edited words. Absent on unchanged lines and on
   * near-total rewrites (where the whole-line background suffices).
   */
  changes?: CharRange[];
}

/** A contiguous block of changes within a file. */
export interface Hunk {
  /** The raw `@@ ... @@` header line (including any section heading). */
  header: string;
  /** 1-based start line on the base side. */
  oldStart: number;
  /** Line count on the base side. */
  oldLines: number;
  /** 1-based start line on the head side. */
  newStart: number;
  /** Line count on the head side. */
  newLines: number;
  /** The hunk's lines in order. */
  lines: DiffLine[];
  /** Content hash identifying this hunk (independent of line numbers). */
  hash: string;
}

/** A single file's changes within a diff. */
export interface FileDiff {
  /** Path on the base side (equals newPath unless renamed/added). */
  oldPath: string;
  /** Path on the head side (equals oldPath unless renamed/deleted). */
  newPath: string;
  /** How the file changed. */
  status: FileStatus;
  /** True for binary files (no textual hunks are produced). */
  isBinary: boolean;
  /** The file's hunks (empty for binary / pure-rename files). */
  hunks: Hunk[];
}

/**
 * Parse `git diff` unified output into structured per-file diffs with per-hunk
 * content hashes. Pure — performs no git or filesystem access.
 */
export function parseUnifiedDiff(text: string): FileDiff[] {
  return splitFileChunks(text).map(parseFileChunk);
}

/** Split raw diff text into per-file line groups, each starting at `diff --git`. */
function splitFileChunks(text: string): string[][] {
  const chunks: string[][] = [];
  let current: string[] | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = [line];
      chunks.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  return chunks;
}

/** Strip an `a/` or `b/` prefix; return null for `/dev/null`. */
function pathOf(raw: string): string | null {
  if (raw === "/dev/null") return null;
  return raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw;
}

function parseFileChunk(lines: string[]): FileDiff {
  const gitLine: string = lines[0] ?? "";
  const gm = /^diff --git a\/(.+) b\/(.+)$/.exec(gitLine);
  const meta = { oldPath: gm?.[1] ?? "", newPath: gm?.[2] ?? "", status: "modified" as FileStatus, isBinary: false };

  const hunkStart: number = lines.findIndex((l) => l.startsWith("@@ "));
  const headerLines: string[] = hunkStart === -1 ? lines.slice(1) : lines.slice(1, hunkStart);
  applyHeaderLines(headerLines, meta);

  const hashPath: string = meta.status === "deleted" ? meta.oldPath : meta.newPath;
  const hunks: Hunk[] = hunkStart === -1 ? [] : parseHunks(lines.slice(hunkStart), hashPath);
  return { ...meta, hunks };
}

/** Mutate a local metadata accumulator from a file's header lines. */
function applyHeaderLines(headerLines: string[], meta: { oldPath: string; newPath: string; status: FileStatus; isBinary: boolean }): void {
  for (const line of headerLines) {
    if (line.startsWith("new file mode")) meta.status = "added";
    else if (line.startsWith("deleted file mode")) meta.status = "deleted";
    else if (line.startsWith("rename from ")) { meta.oldPath = line.slice(12); meta.status = "renamed"; }
    else if (line.startsWith("rename to ")) { meta.newPath = line.slice(10); meta.status = "renamed"; }
    else if (line.startsWith("Binary files ")) meta.isBinary = true;
    else if (line.startsWith("--- ")) applyOldSide(pathOf(line.slice(4)), meta);
    else if (line.startsWith("+++ ")) applyNewSide(pathOf(line.slice(4)), meta);
  }
}

function applyOldSide(path: string | null, meta: { oldPath: string; status: FileStatus }): void {
  if (path === null) meta.status = "added";
  else meta.oldPath = path;
}

function applyNewSide(path: string | null, meta: { newPath: string; status: FileStatus }): void {
  if (path === null) meta.status = "deleted";
  else meta.newPath = path;
}

/** Parse the hunk region of a file into Hunk objects. */
function parseHunks(lines: string[], hashPath: string): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < lines.length) {
    const line: string | undefined = lines[i];
    if (line === undefined || !line.startsWith("@@ ")) { i++; continue; }
    i++;
    const body: string[] = [];
    while (i < lines.length && !(lines[i] ?? "").startsWith("@@ ")) {
      body.push(lines[i] ?? "");
      i++;
    }
    hunks.push(buildHunk(line, body, hashPath));
  }
  return hunks;
}

/** Parse an `@@ -a,b +c,d @@` header; counts default to 1 when omitted. */
function parseHunkHeader(header: string): Pick<Hunk, "oldStart" | "oldLines" | "newStart" | "newLines"> {
  const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
  if (!m) throw new Error(`Malformed hunk header: ${header}`);
  return {
    oldStart: Number(m[1]),
    oldLines: m[2] ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newLines: m[4] ? Number(m[4]) : 1,
  };
}

function buildHunk(header: string, body: string[], hashPath: string): Hunk {
  const ranges = parseHunkHeader(header);
  let oldNo: number = ranges.oldStart;
  let newNo: number = ranges.newStart;
  const parsed: DiffLine[] = [];
  const hashBody: string[] = [];
  for (const raw of body) {
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"
    const marker: string = raw[0] ?? "";
    const text: string = raw.slice(1);
    if (marker === "+") { parsed.push({ kind: "add", oldNo: undefined, newNo, text }); hashBody.push(raw); newNo++; }
    else if (marker === "-") { parsed.push({ kind: "del", oldNo, newNo: undefined, text }); hashBody.push(raw); oldNo++; }
    else if (marker === " ") { parsed.push({ kind: "ctx", oldNo, newNo, text }); hashBody.push(raw); oldNo++; newNo++; }
  }
  return { header, ...ranges, lines: parsed, hash: hunkHash(hashPath, hashBody.join("\n")) };
}
