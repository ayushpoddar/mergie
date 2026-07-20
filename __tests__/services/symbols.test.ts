import { describe, expect, test } from "bun:test";
import type { CommandRunner, CommandResult, RunOptions } from "@/services/exec.ts";
import { BadRegexError, createSymbolsService } from "@/services/symbols.ts";

// ---------------------------------------------------------------------------
// Fake CommandRunner helpers
// ---------------------------------------------------------------------------

/** A single recorded call to the fake runner. */
interface RecordedCall {
  /** The command name (e.g. "sem", "rg"). */
  cmd: string;
  /** The arguments passed. */
  args: string[];
  /** The options passed. */
  opts: RunOptions | undefined;
}

/** A canned response keyed by the command name. */
interface CmdResponse {
  /** stdout text. */
  stdout: string;
  /** exit code (default 0). */
  exitCode?: number;
}

/**
 * A fake runner that dispatches on the command name. Each entry may be a
 * single response or a queue of responses (consumed in order) so a test can
 * model a scoped call returning empty, then a retry returning results.
 */
function makeFakeRunner(
  responses: Record<string, CmdResponse | CmdResponse[]>,
): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queues: Record<string, CmdResponse[]> = {};
  for (const [cmd, r] of Object.entries(responses)) {
    queues[cmd] = Array.isArray(r) ? [...r] : [r];
  }
  const runner: CommandRunner = {
    async run(cmd, args, opts): Promise<CommandResult> {
      calls.push({ cmd, args, opts });
      const queue = queues[cmd] ?? [];
      const next = queue.length > 1 ? queue.shift() : queue[0];
      const resp: CmdResponse = next ?? { stdout: "", exitCode: 0 };
      return { stdout: resp.stdout, stderr: "", exitCode: resp.exitCode ?? 0 };
    },
  };
  return { runner, calls };
}

// ---------------------------------------------------------------------------
// Fixtures (captured from real sem 0.5.5 / rg runs)
// ---------------------------------------------------------------------------

/** `sem entities . --json` — `getGraphQLQuery` defined in two handlers (+ a heading). */
const SEM_ENTITIES_REPO = JSON.stringify([
  { file: "src/a.handler.ts", name: "getGraphQLQuery", type: "method", start_line: 10, end_line: 12, parent_id: "src/a.handler.ts::class::AHandler" },
  { file: "src/b.handler.ts", name: "getGraphQLQuery", type: "method", start_line: 20, end_line: 22, parent_id: "src/b.handler.ts::class::BHandler" },
  { file: "README.md", name: "getGraphQLQuery", type: "heading", start_line: 1, end_line: 1, parent_id: null },
]);

/** `sem entities src/a.handler.ts --json` — single-file form omits the `file` field. */
const SEM_ENTITIES_FILE = JSON.stringify([
  { name: "getGraphQLQuery", type: "method", start_line: 10, end_line: 12, parent_id: "src/a.handler.ts::class::AHandler" },
]);

/** Build file content of `total` lines with specific lines overridden. */
function makeContent(overrides: Array<[number, string]>, total = 30): string {
  const lines: string[] = Array.from({ length: total }, (_, i) => `// line ${i + 1}`);
  for (const [ln, text] of overrides) lines[ln - 1] = text;
  return lines.join("\n");
}

const A_CONTENT = makeContent([[10, "  getGraphQLQuery() {"], [11, "    return Q_A;"], [12, "  }"]]);
const B_CONTENT = makeContent([[20, "  getGraphQLQuery() {"], [21, "    return Q_B;"], [22, "  }"]]);

/** readFile fake backing the two handler definitions above. */
function readDefs(path: string): Promise<string | null> {
  if (path === "src/a.handler.ts") return Promise.resolve(A_CONTENT);
  if (path === "src/b.handler.ts") return Promise.resolve(B_CONTENT);
  return Promise.resolve(null);
}

/**
 * `sem impact classifyBulkOperationState --dependents --json`. The dependent
 * `BulkOperationService` spans [38,646] but the REAL call is at line 138 (see
 * devplan A0#1). This drives the ref-finding fix.
 */
const SEM_IMPACT = JSON.stringify({
  dependents: [
    {
      entityId: "src/svc.ts::class::BulkOperationService",
      file: "src/svc.ts",
      lines: [38, 646],
      name: "BulkOperationService",
      type: "class",
    },
  ],
});

/** The file content backing the dependent above (line 138 is the real call). */
function svcFileContent(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 200; i++) {
    if (i === 38) lines.push("export class BulkOperationService {");
    else if (i === 138) lines.push("    const a = classifyBulkOperationState(x);");
    else lines.push(`  // line ${i}`);
  }
  return lines.join("\n");
}

/** A minimal readFile fake returning `svcFileContent()` for src/svc.ts. */
function fileAt(path: string): Promise<string | null> {
  if (path === "src/svc.ts") return Promise.resolve(svcFileContent());
  return Promise.resolve(null);
}

/** rg JSON stream for two non-adjacent matches under -C 1 (real capture shape). */
const RG_C1 = [
  JSON.stringify({ type: "begin", data: { path: { text: "src/svc.ts" } } }),
  JSON.stringify({ type: "context", data: { path: { text: "src/svc.ts" }, lines: { text: "import x\n" }, line_number: 17, submatches: [] } }),
  JSON.stringify({ type: "match", data: { path: { text: "src/svc.ts" }, lines: { text: "import { classifyBulkOperationState } from y\n" }, line_number: 18, submatches: [{ match: { text: "classifyBulkOperationState" } }] } }),
  JSON.stringify({ type: "context", data: { path: { text: "src/svc.ts" }, lines: { text: "\n" }, line_number: 19, submatches: [] } }),
  JSON.stringify({ type: "context", data: { path: { text: "src/svc.ts" }, lines: { text: "  ): Result {\n" }, line_number: 137, submatches: [] } }),
  JSON.stringify({ type: "match", data: { path: { text: "src/svc.ts" }, lines: { text: "    const a = classifyBulkOperationState(x)\n" }, line_number: 138, submatches: [{ match: { text: "classifyBulkOperationState" } }] } }),
  JSON.stringify({ type: "context", data: { path: { text: "src/svc.ts" }, lines: { text: "    log()\n" }, line_number: 139, submatches: [] } }),
  JSON.stringify({ type: "end", data: { path: { text: "src/svc.ts" } } }),
  JSON.stringify({ type: "summary", data: {} }),
].join("\n");

/** rg JSON stream where two matches are on ADJACENT lines under -C 1. */
const RG_ADJACENT = [
  JSON.stringify({ type: "begin", data: { path: { text: "a.ts" } } }),
  JSON.stringify({ type: "context", data: { path: { text: "a.ts" }, lines: { text: "one\n" }, line_number: 9, submatches: [] } }),
  JSON.stringify({ type: "match", data: { path: { text: "a.ts" }, lines: { text: "foo A\n" }, line_number: 10, submatches: [{ match: { text: "foo" } }] } }),
  JSON.stringify({ type: "match", data: { path: { text: "a.ts" }, lines: { text: "foo B\n" }, line_number: 11, submatches: [{ match: { text: "foo" } }] } }),
  JSON.stringify({ type: "context", data: { path: { text: "a.ts" }, lines: { text: "twelve\n" }, line_number: 12, submatches: [] } }),
  JSON.stringify({ type: "end", data: { path: { text: "a.ts" } } }),
].join("\n");

const CWD = "/repo/head";

// ---------------------------------------------------------------------------
// definition()
// ---------------------------------------------------------------------------

describe("definition()", () => {
  test("lists ALL matching definitions, reading each body from its file", async () => {
    const { runner } = makeFakeRunner({ sem: { stdout: SEM_ENTITIES_REPO } });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.definition("getGraphQLQuery", { cwd: CWD, readFile: readDefs });
    // Two method defs (the README heading is excluded).
    expect(results.map((r) => r.path)).toEqual(["src/a.handler.ts", "src/b.handler.ts"]);
    expect(results.map((r) => r.scope)).toEqual(["AHandler.getGraphQLQuery", "BHandler.getGraphQLQuery"]);
    expect(results.map((r) => r.line)).toEqual([10, 20]);
    expect(results[0]?.kind).toBe("definition");
    expect(results[0]?.matched).toBe("  getGraphQLQuery() {");
    expect(results[0]?.body).toBe("  getGraphQLQuery() {\n    return Q_A;\n  }");
    expect(results[1]?.body).toContain("Q_B");
    expect(results[0]?.before).toEqual([]);
  });

  test("enumerates repo-wide (no file scope)", async () => {
    const { runner, calls } = makeFakeRunner({ sem: { stdout: SEM_ENTITIES_REPO } });
    const svc = createSymbolsService(runner, () => false);
    await svc.definition("getGraphQLQuery", { cwd: CWD, readFile: readDefs });
    expect(calls[0]?.args).toEqual(["entities", ".", "--json"]);
    expect(calls[0]?.opts).toEqual({ cwd: CWD });
  });

  test("scopes to the given file (which omits the file field)", async () => {
    const { runner, calls } = makeFakeRunner({ sem: { stdout: SEM_ENTITIES_FILE } });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.definition("getGraphQLQuery", { cwd: CWD, readFile: readDefs, file: "src/a.handler.ts" });
    expect(calls[0]?.args).toEqual(["entities", "src/a.handler.ts", "--json"]);
    // The path is filled in from the scope since the single-file form omits it.
    expect(results.map((r) => r.path)).toEqual(["src/a.handler.ts"]);
  });

  test("retries repo-wide when the scoped file defines nothing by that name", async () => {
    const { runner, calls } = makeFakeRunner({ sem: [{ stdout: "[]" }, { stdout: SEM_ENTITIES_REPO }] });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.definition("getGraphQLQuery", { cwd: CWD, readFile: readDefs, file: "src/wrong.ts" });
    expect(calls[0]?.args).toEqual(["entities", "src/wrong.ts", "--json"]);
    expect(calls[1]?.args).toEqual(["entities", ".", "--json"]);
    expect(results).toHaveLength(2);
  });

  test("returns [] when nothing matches", async () => {
    const { runner } = makeFakeRunner({ sem: { stdout: "[]" } });
    const svc = createSymbolsService(runner, () => false);
    expect(await svc.definition("nope", { cwd: CWD, readFile: readDefs })).toEqual([]);
  });

  test("returns [] on non-zero exit", async () => {
    const { runner } = makeFakeRunner({ sem: { stdout: "error", exitCode: 1 } });
    const svc = createSymbolsService(runner, () => false);
    expect(await svc.definition("nope", { cwd: CWD, readFile: readDefs })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// usages() — the critical ref-finding fix
// ---------------------------------------------------------------------------

describe("usages()", () => {
  test("emits a usage at the REAL reference line, not the dependent's declaration", async () => {
    const { runner } = makeFakeRunner({ sem: { stdout: SEM_IMPACT } });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.usages("classifyBulkOperationState", { cwd: CWD, readFile: fileAt });
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.kind).toBe("usage");
    expect(r.path).toBe("src/svc.ts");
    expect(r.line).toBe(138); // NOT 38 (the class declaration)
    expect(r.matched).toBe("    const a = classifyBulkOperationState(x);");
    expect(r.scope).toBe("BulkOperationService");
    expect(r.before).toHaveLength(3);
    expect(r.after).toHaveLength(3);
  });

  test("falls back to the declaration line when no in-span ref is found", async () => {
    const impact = JSON.stringify({
      dependents: [{ entityId: "e", file: "src/svc.ts", lines: [40, 50], name: "Svc", type: "class" }],
    });
    const { runner } = makeFakeRunner({ sem: { stdout: impact } });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.usages("classifyBulkOperationState", { cwd: CWD, readFile: fileAt });
    expect(results).toHaveLength(1);
    expect(results[0]?.line).toBe(40);
  });

  test("passes correct argv (no file) and supports --file + retry", async () => {
    const { runner, calls } = makeFakeRunner({
      sem: [{ stdout: JSON.stringify({ dependents: [] }) }, { stdout: SEM_IMPACT }],
    });
    const svc = createSymbolsService(runner, () => false);
    await svc.usages("classifyBulkOperationState", { cwd: CWD, readFile: fileAt, file: "src/state.ts" });
    expect(calls[0]?.args).toEqual(["impact", "classifyBulkOperationState", "--dependents", "--json", "--file", "src/state.ts"]);
    expect(calls[1]?.args).toEqual(["impact", "classifyBulkOperationState", "--dependents", "--json"]);
  });

  test("returns [] on non-zero exit", async () => {
    const { runner } = makeFakeRunner({ sem: { stdout: "", exitCode: 1 } });
    const svc = createSymbolsService(runner, () => false);
    expect(await svc.usages("x", { cwd: CWD, readFile: fileAt })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// search()
// ---------------------------------------------------------------------------

describe("search()", () => {
  test("parses non-adjacent matches with correct before/after by line adjacency", async () => {
    const { runner } = makeFakeRunner({ rg: { stdout: RG_C1 } });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.search("classifyBulkOperationState", { cwd: CWD, contextLines: 1 });
    expect(results).toHaveLength(2);
    const [a, b] = results;
    expect(a?.line).toBe(18);
    expect(a?.before).toEqual(["import x\n"]);
    expect(a?.after).toEqual(["\n"]);
    expect(b?.line).toBe(138);
    expect(b?.before).toEqual(["  ): Result {\n"]);
    expect(b?.after).toEqual(["    log()\n"]);
    expect(a?.kind).toBe("search");
  });

  test("adjacent matches share the line between them as context", async () => {
    const { runner } = makeFakeRunner({ rg: { stdout: RG_ADJACENT } });
    const svc = createSymbolsService(runner, () => false);
    const results = await svc.search("foo", { cwd: CWD, contextLines: 1 });
    expect(results).toHaveLength(2);
    const [a, b] = results;
    expect(a?.line).toBe(10);
    expect(a?.before).toEqual(["one\n"]);
    // line 11 is itself a match; with C=1 it is the "after" context of line 10.
    expect(a?.after).toEqual(["foo B\n"]);
    expect(b?.line).toBe(11);
    expect(b?.before).toEqual(["foo A\n"]);
    expect(b?.after).toEqual(["twelve\n"]);
  });

  test("literal by default: -F, and -i unless caseSensitive", async () => {
    const { runner, calls } = makeFakeRunner({ rg: { stdout: RG_C1 } });
    const svc = createSymbolsService(runner, () => false);
    await svc.search("foo(", { cwd: CWD, contextLines: 2 });
    expect(calls[0]?.args).toEqual(["--json", "-C", "2", "-F", "-i", "--", "foo(", CWD]);
  });

  test("regex mode drops -F; caseSensitive drops -i", async () => {
    const { runner, calls } = makeFakeRunner({ rg: { stdout: RG_C1 } });
    const svc = createSymbolsService(runner, () => false);
    await svc.search("foo.*", { cwd: CWD, contextLines: 3, regex: true, caseSensitive: true });
    expect(calls[0]?.args).toEqual(["--json", "-C", "3", "--", "foo.*", CWD]);
  });

  test("rg exit 1 (no matches) → []", async () => {
    const { runner } = makeFakeRunner({ rg: { stdout: "", exitCode: 1 } });
    const svc = createSymbolsService(runner, () => false);
    expect(await svc.search("nope", { cwd: CWD })).toEqual([]);
  });

  test("rg exit 2 (bad regex) → throws BadRegexError", async () => {
    const { runner } = makeFakeRunner({ rg: { stdout: "", exitCode: 2 } });
    const svc = createSymbolsService(runner, () => false);
    await expect(svc.search("[", { cwd: CWD, regex: true })).rejects.toBeInstanceOf(BadRegexError);
  });
});

// ---------------------------------------------------------------------------
// testOrGenerated flag
// ---------------------------------------------------------------------------

describe("testOrGenerated flag", () => {
  test("uses the injected lockfile matcher OR the test-path heuristic", async () => {
    const impact = JSON.stringify({
      dependents: [{ entityId: "e", file: "src/svc.ts", lines: [38, 646], name: "Svc", type: "class" }],
    });
    // Lockfile matcher says false; but if the path were a test path it would flip.
    const { runner } = makeFakeRunner({ sem: { stdout: impact } });
    const lockMatcher = (p: string): boolean => p.endsWith(".min.js");
    const svc = createSymbolsService(runner, lockMatcher);
    const results = await svc.usages("classifyBulkOperationState", { cwd: CWD, readFile: fileAt });
    expect(results[0]?.testOrGenerated).toBe(false);
  });

  test("flags a search hit whose lockfile matcher returns true", async () => {
    const rg = [
      JSON.stringify({ type: "begin", data: { path: { text: "dist/app.min.js" } } }),
      JSON.stringify({ type: "match", data: { path: { text: "dist/app.min.js" }, lines: { text: "x\n" }, line_number: 1, submatches: [{}] } }),
      JSON.stringify({ type: "end", data: { path: { text: "dist/app.min.js" } } }),
    ].join("\n");
    const { runner } = makeFakeRunner({ rg: { stdout: rg } });
    const svc = createSymbolsService(runner, (p) => p.endsWith(".min.js"));
    const results = await svc.search("x", { cwd: CWD });
    expect(results[0]?.testOrGenerated).toBe(true);
  });
});
