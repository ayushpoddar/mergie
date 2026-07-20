import type { DiffLine } from "@/domain/diff.ts";
import type { SearchSide } from "@/web/state/useCodeSearch.ts";

/** Regex matching a single lookup-able identifier token (JS-like). */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Whether `term` is a single valid identifier we can look up (no dots, calls,
 * spaces, or leading digits). The menu only opens for such tokens.
 */
export function isIdentifier(term: string): boolean {
  return IDENTIFIER.test(term);
}

/**
 * The repo-relative file path encoded in a `.file-section` element id
 * (`file-<path>`), or "" when the id is not a file section. Only the leading
 * `file-` prefix is stripped, so paths that themselves contain `file-` survive.
 */
export function fileFromSectionId(sectionId: string): string {
  const prefix = "file-";
  return sectionId.startsWith(prefix) ? sectionId.slice(prefix.length) : "";
}

/**
 * Which checkout a diff line belongs to: a deleted line only exists on the base,
 * so a symbol selected there defaults the lookup to base; added and context
 * lines default to head (context is identical on both, head is the useful one).
 */
export function sideForLineKind(kind: DiffLine["kind"]): SearchSide {
  return kind === "del" ? "base" : "head";
}

/**
 * Interpret a `data-side` attribute stamped on a code cell. Only the explicit
 * value "base" selects base; anything else (including a missing attribute)
 * defaults to head.
 */
export function parseDataSide(value: string | null): SearchSide {
  return value === "base" ? "base" : "head";
}
