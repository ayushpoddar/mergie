import { useEffect, useRef } from "react";
import { trpc } from "../trpc.ts";
import { highlightToHtml, languageForPath } from "@/web/lib/highlight.ts";
import type { SearchSide } from "../state/useCodeSearch.ts";

/**
 * The single-version body of a file at one commit: the full text with the
 * target line centered on open and flashed via `.split-anchor`. Presentational;
 * owns only the `fileAt` query + the center-on-open effect. Reused by the
 * plain file modal and the file navigator.
 *
 * @param props.prId - PR id the file belongs to.
 * @param props.path - Repo-relative file path.
 * @param props.sha - Commit SHA to read the file at.
 * @param props.line - 1-based line to center and briefly highlight.
 * @param props.side - Which checkout this version is (base/head), stamped as
 *   `data-side` so a symbol selected here defaults its lookup to that side.
 */
export function FileFrame(props: { prId: string; path: string; sha: string; line: number; side: SearchSide }): React.JSX.Element {
  const { prId, path, sha, line, side } = props;
  const query = trpc.fileAt.useQuery({ id: prId, sha, path });
  const lines: string[] = (query.data ?? "").split("\n");
  const language: string | undefined = languageForPath(path);
  const anchor = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (anchor.current) anchor.current.scrollIntoView({ block: "center" });
  }, [query.data, line]);

  return (
    <div className="full-file-body">
      {query.isLoading && <p className="notice">Loading file…</p>}
      <table className="split-table">
        <tbody>
          {lines.map((text, i) => (
            <tr key={i} ref={i + 1 === line ? anchor : undefined} className={i + 1 === line ? "split-anchor" : undefined}>
              <td className="split-no">{i + 1}</td>
              <td className="split-code" data-side={side} dangerouslySetInnerHTML={{ __html: highlightToHtml(text, language) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
