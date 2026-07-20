import type { CodeResult } from "@/services/symbols.ts";

/** Combine two optional scope labels into a comma-separated, de-duplicated string. */
function mergeScopes(a: string | undefined, b: string | undefined): string | undefined {
  const parts: string[] = [];
  for (const s of [a, b]) {
    if (s !== undefined && s !== "" && !parts.includes(s)) parts.push(s);
  }
  return parts.length === 0 ? undefined : parts.join(", ");
}

/**
 * Merge results that share the same `(path, line)` into a single item, joining
 * their distinct `scope` labels. The same physical line can be reported more
 * than once — e.g. a usage that falls inside both a class and one of its
 * methods — and should appear once with the scopes combined.
 *
 * Preserves first-seen order and never mutates the input array or its items.
 *
 * @param results - The raw result list (possibly containing duplicate lines).
 */
export function dedupeResults(results: readonly CodeResult[]): CodeResult[] {
  const byKey = new Map<string, CodeResult>();
  const out: CodeResult[] = [];
  for (const r of results) {
    const key = `${r.path}:${r.line}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      const copy: CodeResult = { ...r };
      byKey.set(key, copy);
      out.push(copy);
    } else {
      existing.scope = mergeScopes(existing.scope, r.scope);
    }
  }
  return out;
}
