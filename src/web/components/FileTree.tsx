import { CheckIcon, FileIcon, SearchIcon } from "./Icons.tsx";
import { fileStatusClass } from "@/web/lib/fileStatus.ts";
import type { FileView } from "@/daemon/reviewService.ts";

/** DOM id for a file's section in the main diff area (for scroll-to). */
export function fileSectionId(path: string): string {
  return `file-${path}`;
}

/** Left-column file list with fuzzy search and viewed indicators. */
export function FileTree(props: {
  files: FileView[];
  query: string;
  onQuery: (q: string) => void;
}): React.JSX.Element {
  const { files, query, onQuery } = props;
  return (
    <nav className="file-tree">
      <div className="file-search-wrap">
        <SearchIcon size={14} />
        <input
          className="file-search"
          type="search"
          placeholder="Filter files…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <ul>
        {files.map((f) => (
          <li key={f.newPath} className={f.viewed ? "file-item viewed" : "file-item"}>
            <a href={`#${fileSectionId(f.newPath)}`} title={f.newPath}>
              <span className="file-flag">{f.viewed && <CheckIcon size={13} />}</span>
              <span className={`file-status-icon ${fileStatusClass(f.status)}`} title={f.status}>
                <FileIcon size={13} />
              </span>
              <span className="file-name">{f.newPath}</span>
              <span className="file-hunkcount">{f.hunks.length}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
