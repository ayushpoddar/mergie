import { useEffect } from "react";
import { FileFrame } from "./FileFrame.tsx";
import { CloseIcon, FileIcon } from "./Icons.tsx";

/** A single-version, full-file view of a file at one commit, centered on a line. */
export interface FileTarget {
  /** Repo-relative file path. */
  path: string;
  /** Commit SHA to read the file at. */
  sha: string;
  /** 1-based line to center and briefly highlight. */
  line: number;
}

/**
 * A modal showing the full text of a file at a single commit, centered on a
 * line. A thin shell around {@link FileFrame}: the modal chrome plus a
 * capture-phase Esc handler so closing this modal does not also collapse the
 * rail behind it.
 *
 * @param props.prId - PR id the file belongs to.
 * @param props.target - The file/sha/line to show.
 * @param props.onClose - Called to dismiss the modal.
 */
export function FileView(props: { prId: string; target: FileTarget; onClose: () => void }): React.JSX.Element {
  const { prId, target, onClose } = props;
  const { path, sha, line } = target;

  // Capture-phase + stopPropagation so Esc closes only this modal, not the
  // rail sidebar behind it, on the same keypress.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal full-file" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <span className="modal-title"><FileIcon size={15} />{path}</span>
          <span className="split-base-head">@ <code>{sha.slice(0, 7)}</code></span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon size={18} /></button>
        </header>
        <FileFrame prId={prId} path={path} sha={sha} line={line} side="head" />
      </div>
    </div>
  );
}
