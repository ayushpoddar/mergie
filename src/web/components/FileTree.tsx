import { useEffect, useState } from "react";
import {
  CheckIcon, FileIcon, SearchIcon, ListIcon, TreeIcon, ChevronRightIcon, ChevronDownIcon,
} from "./Icons.tsx";
import { fileStatusClass } from "@/web/lib/fileStatus.ts";
import { buildFileTree, type TreeDir, type TreeNode } from "@/web/lib/fileTree.ts";
import type { FileView } from "@/daemon/reviewService.ts";

/** DOM id for a file's section in the main diff area (for scroll-to). */
export function fileSectionId(path: string): string {
  return `file-${path}`;
}

/** Left-column file list: fuzzy search, a flat/tree view switch, and the list. */
export function FileTree(props: {
  files: FileView[];
  query: string;
  onQuery: (q: string) => void;
  treeView: boolean;
  onTreeViewChange: (tree: boolean) => void;
}): React.JSX.Element {
  const { files, query, onQuery, treeView, onTreeViewChange } = props;
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
      <div className="file-view-switch" role="group" aria-label="File list view">
        <button
          type="button"
          className={treeView ? "view-btn" : "view-btn active"}
          aria-pressed={!treeView}
          title="Flat list"
          onClick={() => onTreeViewChange(false)}
        >
          <ListIcon size={14} /> List
        </button>
        <button
          type="button"
          className={treeView ? "view-btn active" : "view-btn"}
          aria-pressed={treeView}
          title="Folder tree"
          onClick={() => onTreeViewChange(true)}
        >
          <TreeIcon size={14} /> Tree
        </button>
      </div>
      {treeView
        ? <TreeRoot nodes={buildFileTree(files)} expandAll={query.length > 0} />
        : <FlatList files={files} />}
    </nav>
  );
}

/** The current flat list — every file as one row showing its full path. */
function FlatList(props: { files: FileView[] }): React.JSX.Element {
  return (
    <ul className="file-list-flat">
      {props.files.map((f) => (
        <li key={f.newPath} className={f.viewed ? "file-item viewed" : "file-item"}>
          <FileRow file={f} label={f.newPath} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Tree view: owns per-folder collapse state. While a search is active
 * (`expandAll`) the tree starts fully expanded so matches are visible, but the
 * user can still collapse folders — those transient collapses live in a
 * separate set that is discarded when the search starts or ends, leaving the
 * normal-mode collapse state (restored on clear) untouched.
 */
function TreeRoot(props: { nodes: TreeNode[]; expandAll: boolean }): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [searchCollapsed, setSearchCollapsed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setSearchCollapsed(new Set()); }, [props.expandAll]);

  const set = props.expandAll ? searchCollapsed : collapsed;
  const update = props.expandAll ? setSearchCollapsed : setCollapsed;
  const toggle = (path: string): void =>
    update((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const isOpen = (path: string): boolean => !set.has(path);
  return <TreeLevel nodes={props.nodes} isOpen={isOpen} onToggle={toggle} />;
}

/** One nesting level of the tree; nested levels indent via CSS. */
function TreeLevel(props: {
  nodes: TreeNode[];
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
}): React.JSX.Element {
  return (
    <ul className="file-tree-level">
      {props.nodes.map((node) =>
        node.kind === "dir" ? (
          <DirRow key={node.path} dir={node} isOpen={props.isOpen} onToggle={props.onToggle} />
        ) : (
          <li key={node.file.newPath} className={node.file.viewed ? "file-item viewed" : "file-item"}>
            <FileRow file={node.file} label={node.name} />
          </li>
        ),
      )}
    </ul>
  );
}

/** A collapsible folder row, with its children rendered when open. */
function DirRow(props: {
  dir: TreeDir;
  isOpen: (path: string) => boolean;
  onToggle: (path: string) => void;
}): React.JSX.Element {
  const open: boolean = props.isOpen(props.dir.path);
  return (
    <li className="tree-dir">
      <button
        type="button"
        className="tree-dir-toggle"
        aria-expanded={open}
        onClick={() => props.onToggle(props.dir.path)}
      >
        {open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
        <span className="tree-dir-name">{props.dir.name}</span>
      </button>
      {open && <TreeLevel nodes={props.dir.children} isOpen={props.isOpen} onToggle={props.onToggle} />}
    </li>
  );
}

/** The clickable file row shared by both views (icons, name, hunk count). */
function FileRow(props: { file: FileView; label: string }): React.JSX.Element {
  const { file, label } = props;
  return (
    <a href={`#${fileSectionId(file.newPath)}`} title={file.newPath}>
      <span className="file-flag">{file.viewed && <CheckIcon size={13} />}</span>
      <span className={`file-status-icon ${fileStatusClass(file.status)}`} title={file.status}>
        <FileIcon size={13} />
      </span>
      <span className="file-name">{label}</span>
      <span className="file-hunkcount">{file.hunks.length}</span>
    </a>
  );
}
