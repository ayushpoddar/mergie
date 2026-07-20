/**
 * A code entity from `sem entities <path> --json` — a function, method, class,
 * type, etc. Used to enumerate all definitions of a name (sem's `context` only
 * ever resolves one, so listing all definitions goes through `entities`).
 */
export interface SemEntity {
  /**
   * Repo-relative file the entity is in. Present when listing a directory
   * (`sem entities .`); "" when listing a single file (the file is implied by
   * the path argument — the caller fills it in).
   */
  file: string;
  /** Entity name (the symbol). */
  name: string;
  /** Entity kind, e.g. "function", "method", "class", "type". */
  type: string;
  /** 1-based first line of the entity. */
  startLine: number;
  /** 1-based last line of the entity (inclusive). */
  endLine: number;
  /** Full id of the enclosing entity (e.g. `file::class::Foo`), or null. */
  parentId: string | null;
}

/** Read a number, or a fallback, from an unknown record property. */
function num(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

/**
 * Parse a `sem entities --json` payload (an array of raw entities) into typed
 * {@link SemEntity} records. Returns [] on any shape error rather than throwing.
 */
export function parseEntities(raw: string): SemEntity[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SemEntity[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const rec: Record<string, unknown> = { ...item };
    if (typeof rec.name !== "string" || typeof rec.type !== "string") continue;
    const parentId: string | null = typeof rec.parent_id === "string" ? rec.parent_id : null;
    out.push({
      file: typeof rec.file === "string" ? rec.file : "",
      name: rec.name,
      type: rec.type,
      startLine: num(rec.start_line, 1),
      endLine: num(rec.end_line, num(rec.start_line, 1)),
      parentId,
    });
  }
  return out;
}

/**
 * The entities that are definitions of `name`: an exact name match, excluding
 * non-code entities (markdown headings). Partial-name matches are excluded.
 */
export function matchEntities(entities: readonly SemEntity[], name: string): SemEntity[] {
  return entities.filter((e) => e.name === name && e.type !== "heading");
}

/**
 * The inclusive 1-based `[startLine, endLine]` slice of `lines` as a body
 * string, plus its first non-empty line (a readable header for the preview).
 * Bounds are clamped to the available lines.
 */
export function sliceBody(lines: string[], startLine: number, endLine: number): { body: string; matched: string } {
  const from: number = Math.max(1, startLine);
  const to: number = Math.min(lines.length, endLine);
  const slice: string[] = lines.slice(from - 1, to);
  const body: string = slice.join("\n");
  const matched: string = slice.find((l) => l.trim() !== "") ?? "";
  return { body, matched };
}

/**
 * A human scope label for a definition: `Parent.name` when the entity is nested
 * (e.g. a method of a class), otherwise the bare `name`. The parent name is the
 * last `::`-delimited segment of the parent id.
 */
export function scopeLabel(parentId: string | null, name: string): string {
  if (parentId === null || parentId === "") return name;
  const segments: string[] = parentId.split("::");
  const parent: string = segments[segments.length - 1] ?? "";
  return parent === "" ? name : `${parent}.${name}`;
}
