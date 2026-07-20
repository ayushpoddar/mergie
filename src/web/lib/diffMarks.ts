import type { CharRange } from "@/domain/diff.ts";

/** Opening tag for a highlighted changed run. */
const MARK_OPEN = '<mark class="diff-word">';
/** Closing tag for a highlighted changed run. */
const MARK_CLOSE = "</mark>";

/** A unit of already-highlighted HTML: a tag, an entity, or a literal char. */
interface Token {
  /** The raw HTML slice. */
  html: string;
  /** How many plain-text characters this token represents (0 for tags). */
  width: number;
}

/**
 * Overlay word-diff highlighting onto already-syntax-highlighted HTML: wrap the
 * plain-text character ranges in `<mark class="diff-word">`, splitting so the
 * mark never crosses a syntax-highlight tag boundary (it is closed before every
 * tag and reopened after, keeping the markup well-nested). Pure — HTML in, HTML
 * out.
 *
 * @param html   - One line of syntax-highlighted HTML (from `highlightToHtml`).
 * @param ranges - Changed character ranges as offsets into the *plain* text.
 */
export function applyDiffMarks(html: string, ranges: CharRange[]): string {
  if (ranges.length === 0) return html;
  let out = "";
  let offset = 0;
  let markOpen = false;
  for (const token of tokenize(html)) {
    if (token.width === 0) {
      if (markOpen) { out += MARK_CLOSE; markOpen = false; }
      out += token.html;
      continue;
    }
    const inRange = isInRange(offset, ranges);
    if (inRange && !markOpen) { out += MARK_OPEN; markOpen = true; }
    else if (!inRange && markOpen) { out += MARK_CLOSE; markOpen = false; }
    out += token.html;
    offset += token.width;
  }
  if (markOpen) out += MARK_CLOSE;
  return out;
}

/** Split highlighted HTML into tags (width 0), entities (width 1), and chars. */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch === "<") {
      const end = html.indexOf(">", i);
      const stop = end === -1 ? html.length : end + 1;
      tokens.push({ html: html.slice(i, stop), width: 0 });
      i = stop;
    } else if (ch === "&") {
      const entity = matchEntity(html, i);
      tokens.push({ html: entity, width: 1 });
      i += entity.length;
    } else {
      tokens.push({ html: ch ?? "", width: 1 });
      i += 1;
    }
  }
  return tokens;
}

/** Match an HTML entity starting at `i`, or the bare `&` if it is not one. */
function matchEntity(html: string, i: number): string {
  const semi = html.indexOf(";", i);
  if (semi === -1) return "&";
  const body = html.slice(i + 1, semi);
  return /^#?[a-zA-Z0-9]+$/.test(body) ? html.slice(i, semi + 1) : "&";
}

/** Whether a plain-text offset falls within any changed range. */
function isInRange(offset: number, ranges: CharRange[]): boolean {
  return ranges.some((r) => offset >= r.start && offset < r.end);
}
