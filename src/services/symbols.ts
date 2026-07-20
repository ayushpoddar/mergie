import { bunRunner } from "@/services/exec.ts";
import type { CommandRunner } from "@/services/exec.ts";
import { sliceContext } from "@/domain/context.ts";
import { findReferences } from "@/domain/references.ts";
import { isTestOrGenerated } from "@/domain/generated.ts";
import { parseEntities, matchEntities, sliceBody, scopeLabel, type SemEntity } from "@/domain/entities.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The kind of a code result — how it was found. */
export type CodeResultKind = "definition" | "usage" | "search";

/**
 * A unified code result for the symbol/search UI. Every navigation and search
 * path (sem definition, sem usages, rg search) maps to this single shape.
 */
export interface CodeResult {
  /** Repo-relative path to the file containing the result. */
  path: string;
  /**
   * 1-based line number of the real reference/definition line. For a
   * definition this is the entity's first line; for a usage the actual
   * reference line inside the dependent; for a search the matching line.
   */
  line: number;
  /** Context lines before `matched`, top-to-bottom (empty for definitions). */
  before: string[];
  /** The reference/definition/match line text (no trailing newline stripping). */
  matched: string;
  /** Context lines after `matched`, top-to-bottom (empty for definitions). */
  after: string[];
  /** Full definition body — populated for `kind: "definition"` only. */
  body?: string;
  /**
   * Entity scope label — the entity name/type for a definition, or the
   * dependent entity's name for a usage. Undefined for search hits.
   */
  scope?: string;
  /** How this result was found. */
  kind: CodeResultKind;
  /**
   * Backend-computed: whether this file is test or generated code (lockfile /
   * generated globs OR the test-path heuristic), for the UI's hide toggle.
   */
  testOrGenerated: boolean;
}

/**
 * Reads the full text of a repo-relative file at the resolved checkout.
 * Returns null when the file does not exist there.
 */
export type ReadFile = (path: string) => Promise<string | null>;

/** Options shared by the sem-backed lookups (definition/usages). */
export interface SemLookupOptions {
  /** The checkout directory to run `sem` in. */
  cwd: string;
  /** Reads a repo-relative file's content at the same checkout. */
  readFile: ReadFile;
  /** Restricts sem to these file extensions (e.g. [".ts"]). */
  fileExts?: string[];
  /** Optional repo-relative file scope hint → passed as `--file`. */
  file?: string;
}

/** Options for the rg-backed literal/regex search. */
export interface SearchOptions {
  /** The directory to search in. */
  cwd: string;
  /** Context lines to include on each side of a match (default 3). */
  contextLines?: number;
  /** Treat the query as a regex (drops `-F`). Default false (literal). */
  regex?: boolean;
  /** Case-sensitive match (drops `-i`). Default false (case-insensitive). */
  caseSensitive?: boolean;
}

/** The symbol/search service returned by {@link createSymbolsService}. */
export interface SymbolsService {
  /**
   * List ALL definitions of a name by enumerating entities via
   * `sem entities <scope> --json` (sem's `context` only ever resolves one). The
   * scope is the given `file` when set, else the repo (`.`); if the file defines
   * nothing by this name (e.g. the click was a cross-file reference) it retries
   * repo-wide. Each entity's body is read from its file (its line span). Returns
   * [] on sem failure.
   */
  definition(symbol: string, opts: SemLookupOptions): Promise<CodeResult[]>;

  /**
   * Resolve a symbol's usages via `sem impact <symbol> --dependents --json`.
   * For each dependent, reads its file and finds the REAL reference line(s)
   * within the dependent's span (not the dependent's declaration). Same
   * `--file` scope + retry behaviour as {@link definition}.
   */
  usages(symbol: string, opts: SemLookupOptions): Promise<CodeResult[]>;

  /**
   * Literal (default) or regex search via `rg --json`. Distinguishes rg exit 2
   * (bad regex → throws {@link BadRegexError}) from exit 1 (no matches → []).
   */
  search(word: string, opts: SearchOptions): Promise<CodeResult[]>;
}

/** Thrown when `rg` reports a syntactically invalid regex (exit code 2). */
export class BadRegexError extends Error {
  constructor(message = "Invalid search pattern.") {
    super(message);
    this.name = "BadRegexError";
  }
}

// ---------------------------------------------------------------------------
// Internal sem JSON shapes (non-exported)
// ---------------------------------------------------------------------------

/** A dependent entity in the `sem impact --dependents --json` response. */
interface SemDependent {
  file: string;
  name: string;
  type: string;
  /** Inclusive [start, end] line numbers (1-based) of the dependent entity. */
  lines?: [number, number];
}

// ---------------------------------------------------------------------------
// Internal rg JSON shapes (non-exported)
// ---------------------------------------------------------------------------

/** A line seen within a file block, tagged match vs context. */
interface RgBlockLine {
  /** 1-based line number. */
  no: number;
  /** Full line text. */
  text: string;
  /** True for a match line, false for a context line. */
  isMatch: boolean;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/** Parse JSON, returning null on failure (no throw). */
function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Extract `dependents` from a `sem impact` payload, or [] on any shape error. */
function semDependents(raw: string): SemDependent[] {
  const parsed = tryParse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("dependents" in parsed) ||
    !Array.isArray(parsed.dependents)
  ) {
    return [];
  }
  return parsed.dependents;
}

/** Read the property `key` from an unknown value, or undefined. */
function prop(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  const record: Record<string, unknown> = { ...value };
  return record[key];
}

/** Read a string property, or undefined if absent/not a string. */
function strProp(value: unknown, key: string): string | undefined {
  const v = prop(value, key);
  return typeof v === "string" ? v : undefined;
}

/** Read a number property, or undefined if absent/not a number. */
function numProp(value: unknown, key: string): number | undefined {
  const v = prop(value, key);
  return typeof v === "number" ? v : undefined;
}

/** The repo-relative path from an rg event's `data.path.text`, or undefined. */
function eventPath(event: unknown): string | undefined {
  return strProp(prop(prop(event, "data"), "path"), "text");
}

/**
 * Group the rg JSON stream into per-file blocks of match/context lines. A new
 * block starts on each `begin`; lines accumulate until the next `begin`/`end`.
 */
function rgBlocks(raw: string): Array<{ path: string; lines: RgBlockLine[] }> {
  const blocks: Array<{ path: string; lines: RgBlockLine[] }> = [];
  let current: { path: string; lines: RgBlockLine[] } | null = null;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    const event = tryParse(line);
    const type = strProp(event, "type");
    if (type === "begin") {
      current = { path: eventPath(event) ?? "", lines: [] };
      blocks.push(current);
    } else if ((type === "match" || type === "context") && current !== null) {
      const data = prop(event, "data");
      const text = strProp(prop(data, "lines"), "text");
      const no = numProp(data, "line_number");
      if (text !== undefined && no !== undefined) {
        current.lines.push({ no, text, isMatch: type === "match" });
      }
    }
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a SymbolsService backed by `sem` and `rg` subprocesses.
 * @param runner - CommandRunner for spawning subprocesses (fake in tests).
 * @param isLockfileOrGenerated - Path→boolean matcher for lockfile/generated
 *   files (wired by the caller to the config glob matcher). Combined with the
 *   pure test-path heuristic to set `testOrGenerated` on each result.
 */
export function createSymbolsService(
  runner: CommandRunner = bunRunner,
  isLockfileOrGenerated: (path: string) => boolean = () => false,
): SymbolsService {
  /** Compute the `testOrGenerated` flag for a repo-relative path. */
  function flag(path: string): boolean {
    return isTestOrGenerated(path, isLockfileOrGenerated(path));
  }

  /**
   * Run `sem <argv>` with an optional `--file` scope, retrying unscoped when
   * the scoped call produced no usable entries.
   * @returns Raw stdout of the call that produced entries (or the last call).
   */
  async function semWithScope(
    base: string[],
    cwd: string,
    file: string | undefined,
    hasEntries: (stdout: string) => boolean,
  ): Promise<string> {
    if (file !== undefined) {
      const scoped = await runner.run("sem", [...base, "--file", file], { cwd });
      if (scoped.exitCode === 0 && hasEntries(scoped.stdout)) return scoped.stdout;
    }
    const res = await runner.run("sem", base, { cwd });
    return res.exitCode === 0 ? res.stdout : "";
  }

  /** Run `sem entities <scope> --json`; returns "" on failure. */
  async function runEntities(scope: string, cwd: string): Promise<string> {
    const res = await runner.run("sem", ["entities", scope, "--json"], { cwd });
    return res.exitCode === 0 ? res.stdout : "";
  }

  /** Map one entity to a definition result, reading its body from the file. */
  async function entityToDefinition(e: SemEntity, readFile: ReadFile): Promise<CodeResult> {
    const scope = scopeLabel(e.parentId, e.name);
    const testOrGenerated = flag(e.file);
    const content = await readFile(e.file);
    if (content === null) {
      return { path: e.file, line: e.startLine, before: [], matched: e.name, after: [], body: "", scope, kind: "definition", testOrGenerated };
    }
    const { body, matched } = sliceBody(content.split("\n"), e.startLine, e.endLine);
    return { path: e.file, line: e.startLine, before: [], matched, after: [], body, scope, kind: "definition", testOrGenerated };
  }

  /** Build usages for one dependent by finding real references in its span. */
  async function usagesForDependent(
    dep: SemDependent,
    symbol: string,
    readFile: ReadFile,
  ): Promise<CodeResult[]> {
    const span: [number, number] = dep.lines ?? [1, 1];
    const content = await readFile(dep.file);
    const scope = dep.name;
    const testOrGenerated = flag(dep.file);
    if (content === null) {
      return [{ path: dep.file, line: span[0], before: [], matched: "", after: [], scope, kind: "usage", testOrGenerated }];
    }
    const lines = content.split("\n");
    const refs = findReferences(lines, span, symbol);
    const targets = refs.length > 0 ? refs : [span[0]];
    return targets.map((refLine) => {
      const slice = sliceContext(lines, refLine, 3);
      return { path: dep.file, line: refLine, before: slice.before, matched: slice.matched, after: slice.after, scope, kind: "usage", testOrGenerated };
    });
  }

  return {
    async definition(symbol, opts) {
      // Enumerate ALL definitions of the name (sem `context` only resolves one).
      // Scope to the clicked file when given; if that file defines nothing by
      // this name (e.g. the click was on a cross-file reference), fall back to a
      // repo-wide enumeration so every matching definition is listed.
      const file = opts.file;
      const scoped: SemEntity[] = file !== undefined
        ? matchEntities(parseEntities(await runEntities(file, opts.cwd)), symbol).map((e) => ({ ...e, file: e.file || file }))
        : [];
      const matches: SemEntity[] = scoped.length > 0
        ? scoped
        : matchEntities(parseEntities(await runEntities(".", opts.cwd)), symbol);
      const results: CodeResult[] = [];
      for (const e of matches) results.push(await entityToDefinition(e, opts.readFile));
      return results;
    },

    async usages(symbol, opts) {
      const base = ["impact", symbol, "--dependents", "--json"];
      if (opts.fileExts && opts.fileExts.length > 0) base.push("--file-exts", ...opts.fileExts);
      const stdout = await semWithScope(base, opts.cwd, opts.file, (s) =>
        semDependents(s).length > 0,
      );
      const results: CodeResult[] = [];
      for (const dep of semDependents(stdout)) {
        results.push(...(await usagesForDependent(dep, symbol, opts.readFile)));
      }
      return results;
    },

    async search(word, opts) {
      const contextLines = opts.contextLines ?? 3;
      const args = ["--json", "-C", String(contextLines)];
      if (opts.regex !== true) args.push("-F");
      if (opts.caseSensitive !== true) args.push("-i");
      args.push("--", word, opts.cwd);
      const result = await runner.run("rg", args);
      if (result.exitCode === 2) throw new BadRegexError();
      if (result.exitCode !== 0) return [];
      return searchResults(result.stdout, contextLines, flag);
    },
  };
}

/** Map an rg JSON stream to search `CodeResult[]` using line-adjacency context. */
function searchResults(
  raw: string,
  contextLines: number,
  flag: (path: string) => boolean,
): CodeResult[] {
  const results: CodeResult[] = [];
  for (const block of rgBlocks(raw)) {
    const testOrGenerated = flag(block.path);
    for (const line of block.lines) {
      if (!line.isMatch) continue;
      const before = block.lines
        .filter((l) => l.no >= line.no - contextLines && l.no < line.no)
        .map((l) => l.text);
      const after = block.lines
        .filter((l) => l.no > line.no && l.no <= line.no + contextLines)
        .map((l) => l.text);
      results.push({ path: block.path, line: line.no, before, matched: line.text, after, kind: "search", testOrGenerated });
    }
  }
  return results;
}
