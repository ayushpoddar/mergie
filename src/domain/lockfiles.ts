import { basename } from "node:path";

/**
 * Decide whether a file path is a lock / generated file that should be
 * hideable via the UI toggle.
 *
 * A path matches if any glob matches the full path, or (for convenience) the
 * bare filename — so `package-lock.json` matches `web/package-lock.json`, and
 * `*.min.js` matches `dist/app.min.js`.
 *
 * @param path     Repository-relative file path.
 * @param patterns Glob patterns (from built-in defaults + user config).
 */
export function isLockfile(path: string, patterns: readonly string[]): boolean {
  const name: string = basename(path);
  return patterns.some((pattern) => {
    const glob = new Bun.Glob(pattern);
    return glob.match(path) || glob.match(name);
  });
}
