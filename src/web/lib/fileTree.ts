import type { FileView } from "@/daemon/reviewService.ts";

/**
 * A folder in the sidebar file tree. Its {@link name} may be a compressed chain
 * of single-child directories (GitHub-style), e.g. `"src/web/components"`.
 */
export interface TreeDir {
  /** Discriminant. */
  kind: "dir";
  /** Display label — a `/`-joined chain when single-child dirs were merged. */
  name: string;
  /** Full path from the root; stable id for collapse state (equals `name`). */
  path: string;
  /** Child directories then files; each group sorted alphabetically. */
  children: TreeNode[];
}

/** A file leaf in the sidebar file tree. */
export interface TreeFile {
  /** Discriminant. */
  kind: "file";
  /** Base name (the path segment after the last slash). */
  name: string;
  /** The underlying file — carries path, status, viewed state and hunks. */
  file: FileView;
}

/** A node in the sidebar file tree: either a folder or a file leaf. */
export type TreeNode = TreeDir | TreeFile;

/** Mutable scratch node used while inserting paths; converted to {@link TreeNode}. */
interface RawDir {
  /** Sub-directories keyed by their (single-segment) name. */
  dirs: Map<string, RawDir>;
  /** Files directly in this directory, paired with their base name. */
  files: { name: string; file: FileView }[];
}

/**
 * Build a GitHub-style file tree from a flat file list. Directories that hold a
 * single sub-directory and no files are compressed into one row. Pure — does
 * not mutate its input.
 */
export function buildFileTree(files: readonly FileView[]): TreeNode[] {
  const root: RawDir = { dirs: new Map(), files: [] };
  for (const file of files) insert(root, file);
  return toNodes(root, "");
}

/** Insert one file into the scratch tree along its path segments. */
function insert(root: RawDir, file: FileView): void {
  const segments: string[] = file.newPath.split("/");
  const base: string = segments[segments.length - 1] ?? file.newPath;
  let dir: RawDir = root;
  for (const seg of segments.slice(0, -1)) {
    let child: RawDir | undefined = dir.dirs.get(seg);
    if (child === undefined) {
      child = { dirs: new Map(), files: [] };
      dir.dirs.set(seg, child);
    }
    dir = child;
  }
  dir.files.push({ name: base, file });
}

/** Convert a scratch directory's contents into sorted tree nodes. */
function toNodes(raw: RawDir, prefix: string): TreeNode[] {
  const dirs: TreeDir[] = [...raw.dirs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => makeDir(name, child, prefix));
  const files: TreeFile[] = [...raw.files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, file }) => ({ kind: "file", name, file }));
  return [...dirs, ...files];
}

/** Build a directory node, compressing single-child directory chains. */
function makeDir(name: string, raw: RawDir, prefix: string): TreeDir {
  let displayName: string = name;
  let path: string = prefix.length > 0 ? `${prefix}/${name}` : name;
  let current: RawDir = raw;
  let onlyChild = soleChild(current);
  while (onlyChild !== null) {
    displayName = `${displayName}/${onlyChild.name}`;
    path = `${path}/${onlyChild.name}`;
    current = onlyChild.dir;
    onlyChild = soleChild(current);
  }
  return { kind: "dir", name: displayName, path, children: toNodes(current, path) };
}

/** The lone sub-directory of a dir that has no files and exactly one child. */
function soleChild(raw: RawDir): { name: string; dir: RawDir } | null {
  if (raw.files.length !== 0 || raw.dirs.size !== 1) return null;
  const [entry] = [...raw.dirs.entries()];
  if (entry === undefined) return null;
  return { name: entry[0], dir: entry[1] };
}
