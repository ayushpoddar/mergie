import { highlightToHtml, languageForPath } from "@/web/lib/highlight.ts";
import type { CodeResult } from "@/services/symbols.ts";

/** Beyond this many lines, render plain (no highlighting) to avoid jank. */
const HIGHLIGHT_LINE_CAP = 400;

/** One rendered code line: its 1-based number, text, and whether it is the hit. */
interface PreviewLine {
  /** 1-based line number in the source file. */
  no: number;
  /** The line's text. */
  text: string;
  /** True for the matched/definition-start line (visually emphasized). */
  matched: boolean;
}

/** Build the display lines for a result, numbered from its real file lines. */
function previewLines(r: CodeResult): PreviewLine[] {
  if (r.kind === "definition") {
    const body: string[] = (r.body ?? r.matched).split("\n");
    return body.map((text, i) => ({ no: r.line + i, text, matched: i === 0 }));
  }
  const before: PreviewLine[] = r.before.map((text, i) => ({ no: r.line - r.before.length + i, text, matched: false }));
  const after: PreviewLine[] = r.after.map((text, i) => ({ no: r.line + 1 + i, text, matched: false }));
  return [...before, { no: r.line, text: r.matched, matched: true }, ...after];
}

/**
 * Render one {@link CodeResult} as a compact, syntax-highlighted code block.
 * For a definition the full `body` is shown; otherwise the `before/matched/
 * after` context is shown with the matched line emphasized. The language is
 * inferred from the file path. Blocks longer than {@link HIGHLIGHT_LINE_CAP}
 * render as plain (escaped) text to avoid highlighter jank on huge bodies.
 *
 * @param props.result - The result to render.
 */
export function CodePreview(props: { result: CodeResult }): React.JSX.Element {
  const { result } = props;
  const lines: PreviewLine[] = previewLines(result);
  const language: string | undefined = languageForPath(result.path);
  const highlight: boolean = lines.length <= HIGHLIGHT_LINE_CAP;

  return (
    <table className="code-preview">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className={l.matched ? "code-preview-line matched" : "code-preview-line"}>
            <td className="code-preview-no">{l.no}</td>
            <td
              className="code-preview-code"
              dangerouslySetInnerHTML={{ __html: highlight ? highlightToHtml(l.text, language) : escapePlain(l.text) }}
            />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Minimal HTML escape for the uncapped plain-render path. */
function escapePlain(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
