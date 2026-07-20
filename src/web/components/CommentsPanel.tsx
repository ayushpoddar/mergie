import { useEffect, useState } from "react";
import { trpc } from "../trpc.ts";
import { formatCommitTime } from "@/web/lib/time.ts";
import { fileSectionId } from "./FileTree.tsx";
import { PostMenu } from "./PostMenu.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { ConfirmButton } from "./ConfirmButton.tsx";
import { CommentIcon, ExternalIcon, SyncIcon } from "./Icons.tsx";
import { filterAllComments, type AuthorFilter, type SourceFilter } from "@/web/lib/commentFilters.ts";
import { classifyCommentClick, commentHunkHash, commentDomIdCandidates } from "@/web/lib/commentVisibility.ts";
import type { AllCommentEntry, CommentOrigin } from "@/daemon/allComments.ts";
import type { FileView } from "@/daemon/reviewService.ts";
import type { PostTarget } from "@/daemon/registry.ts";

/** A truncated single-line preview of a comment body. */
function preview(body: string): string {
  const flat: string = body.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

/** Short label for an origin badge. */
const ORIGIN_LABEL: Record<CommentOrigin, string> = {
  local: "local draft",
  posted: "posted to GitHub",
  github: "from GitHub",
};

/**
 * Scroll to the first rendered element matching one of the candidate ids and
 * flash a transient highlight on it. Returns whether a target was found.
 */
function scrollToComment(candidateIds: string[]): boolean {
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("comment-flash");
    // Force reflow so re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add("comment-flash");
    return true;
  }
  return false;
}

/**
 * Scroll to a just-revealed comment once the diff has re-rendered it. The
 * reveal is a React state change, so the element isn't in the DOM on this tick;
 * retry over a few animation frames until it appears (or we give up).
 */
function scrollWhenReady(candidateIds: string[], attempts = 8): void {
  if (scrollToComment(candidateIds) || attempts <= 0) return;
  requestAnimationFrame(() => scrollWhenReady(candidateIds, attempts - 1));
}

/**
 * The "All comments" surface hosted in the right-rail sidebar. Lists every
 * comment on the PR (local drafts, mergie-posted, and fetched GitHub — mine and
 * others'), deduped, with author/source/file filters, counts, and the same
 * copy / post / edit / delete affordances as the diff. Clicking a comment that
 * is rendered in the current range scrolls the diff to it (without changing the
 * range); if it is in the current range but hidden by a view toggle it is first
 * revealed, then scrolled to; clicking one truly outside the range opens a
 * confirmation offering to view its own range in a new tab. The rail supplies
 * the panel chrome (title + close); this component renders the body.
 */
export function CommentsPanel(props: {
  /** PR id. */
  prId: string;
  /** All files/hunks in the selected range (before view toggles). */
  rangeFiles: FileView[];
  /** The subset currently rendered on screen (after view toggles). */
  renderedFiles: FileView[];
  /** Baseline SHA for the "view in context" new-tab link (whole-PR start). */
  baselineSha: string;
  /** Force a hunk visible so a jumped-to comment can be scrolled into view. */
  onReveal: (hunkHash: string) => void;
}): React.JSX.Element {
  const { prId, rangeFiles, renderedFiles, baselineSha, onReveal } = props;
  const comments = trpc.listAllComments.useQuery({ id: prId });
  const utils = trpc.useUtils();
  const invalidate = (): void => {
    void utils.listAllComments.invalidate();
    void utils.listComments.invalidate();
    void utils.rangeView.invalidate();
  };
  const del = trpc.deleteComment.useMutation({ onSuccess: invalidate });
  const post = trpc.postComment.useMutation({ onSuccess: invalidate });
  const sync = trpc.syncGithub.useMutation({ onSuccess: invalidate });
  const editLocal = trpc.editComment.useMutation({ onSuccess: invalidate });
  const editGh = trpc.editGithubComment.useMutation({ onSuccess: invalidate });
  const delGh = trpc.deleteGithubComment.useMutation({ onSuccess: invalidate });
  const previewPost = (commentId: number, target: PostTarget) =>
    utils.postCommentPreview.fetch({ id: prId, commentId, target });

  const [fileFilter, setFileFilter] = useState("");
  const [author, setAuthor] = useState<AuthorFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [outOfRange, setOutOfRange] = useState<AllCommentEntry | null>(null);

  // Esc dismisses the out-of-range confirmation before the rail collapses the
  // sidebar. Capture-phase + stopPropagation so the rail's own Esc handler does
  // not also fire on the same keypress while the prompt is open.
  useEffect(() => {
    if (!outOfRange) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOutOfRange(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [outOfRange]);

  const removeEntry = (c: AllCommentEntry): void => {
    if (c.localId !== null) del.mutate({ id: prId, commentId: c.localId });
    else if (c.githubId !== null) delGh.mutate({ id: prId, githubId: c.githubId });
  };
  const saveEdit = (c: AllCommentEntry): void => {
    const body = editDraft.trim();
    if (body.length > 0) {
      if (c.localId !== null) editLocal.mutate({ id: prId, commentId: c.localId, body });
      else if (c.githubId !== null) editGh.mutate({ id: prId, githubId: c.githubId, body });
    }
    setEditingKey(null);
  };

  const all: AllCommentEntry[] = comments.data ?? [];
  const fileNames: string[] = [...new Set(all.map((c) => c.path).filter((p): p is string => p !== null))].sort();
  const shown: AllCommentEntry[] = filterAllComments(all, { author, source, file: fileFilter });

  const contextHref = (c: AllCommentEntry): string =>
    `/?pr=${prId}&start=${baselineSha}&end=${c.madeAtSha}#${c.path ? fileSectionId(c.path) : ""}`;

  // Handle a click on a comment row:
  // - shown now → scroll to it;
  // - in the range but not on screen (hidden by a toggle, or in an auto-collapsed
  //   viewed hunk) → reveal + expand its hunk, then scroll once the diff has
  //   re-rendered (retry across a few frames);
  // - truly out of range → confirm before leaving the range.
  const openComment = (c: AllCommentEntry): void => {
    const action = classifyCommentClick(c, rangeFiles, renderedFiles);
    if (action.kind === "out-of-range") { setOutOfRange(c); return; }
    // "scroll" may still fail if the hunk is rendered but collapsed; fall back
    // to the reveal path (which also force-expands the hunk).
    if (action.kind === "scroll" && scrollToComment(commentDomIdCandidates(c))) return;
    const hunkHash: string | null = commentHunkHash(c, rangeFiles);
    if (hunkHash === null) { setOutOfRange(c); return; }
    onReveal(hunkHash);
    scrollWhenReady(commentDomIdCandidates(c));
  };

  return (
    <div className="comments-panel-content">
      <div className="comments-panel-count reviewed-count">
        {shown.length === all.length
          ? `${all.length} comment${all.length === 1 ? "" : "s"}`
          : `${shown.length} of ${all.length} comments`}
      </div>
      <div className="comments-panel-filters">
        <div className="segmented" role="group" aria-label="Filter by author">
          {AUTHOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={author === opt.value ? "segmented-item active" : "segmented-item"}
              aria-pressed={author === opt.value}
              onClick={() => setAuthor(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label>Source{" "}
          <select value={source} onChange={(e) => setSource(asSource(e.target.value))}>
            <option value="all">All sources</option>
            <option value="local">Local drafts (never posted)</option>
            <option value="github">On GitHub</option>
          </select>
        </label>
        <label>File{" "}
          <select value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}>
            <option value="">All files</option>
            {fileNames.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm" disabled={sync.isPending} onClick={() => sync.mutate({ id: prId })}>
          <SyncIcon size={13} /> {sync.isPending ? "Fetching…" : "Fetch GitHub comments"}
        </button>
      </div>
      <ul className="comment-list">
        {shown.map((c) => (
          <li key={c.key} className="comment-list-item">
            <button type="button" className="comment-jump" onClick={() => openComment(c)} title="Go to this comment in the diff">
              <div className="comment-list-meta">
                <code>{c.path ?? "(no file)"}</code>
                <span>{c.location}</span>
                {c.side && <span>{c.side}</span>}
                <span className="comment-author">{c.mine ? "You" : c.author}</span>
                <span className={`badge origin-${c.origin}`}>{ORIGIN_LABEL[c.origin]}</span>
                {c.replyCount > 0 && <span className="reply-count">{c.replyCount} repl{c.replyCount === 1 ? "y" : "ies"}</span>}
                {c.createdAt !== null && <span className="comment-time">{formatCommitTime(new Date(c.createdAt).toISOString())}</span>}
              </div>
            </button>
            {editingKey === c.key ? (
              <div className="comment-edit">
                <textarea className="comment-textarea" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                <div className="comment-edit-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(c)} disabled={editDraft.trim().length === 0}>Save</button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingKey(null)}>Cancel</button>
                  {c.origin !== "local" && <span className="notice">Edits the comment on GitHub.</span>}
                </div>
              </div>
            ) : (
              <div className="comment-list-body">{preview(c.body)}</div>
            )}
            <div className="comment-list-actions">
              {c.origin === "local" && c.localId !== null && (
                <PostMenu
                  preview={(target) => previewPost(c.localId ?? -1, target)}
                  onPost={(target) => post.mutate({ id: prId, commentId: c.localId ?? -1, target })}
                />
              )}
              <CopyButton text={c.body} />
              {c.mine && editingKey !== c.key && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditingKey(c.key); setEditDraft(c.body); }}>Edit</button>
              )}
              {c.mine && (
                <ConfirmButton
                  warning={c.origin === "local" ? undefined : "Also deletes it on GitHub."}
                  onConfirm={() => removeEntry(c)}
                />
              )}
            </div>
          </li>
        ))}
        {shown.length === 0 && (
          <li>
            {comments.isLoading ? (
              <p className="notice">Loading comments…</p>
            ) : (
              <div className="empty-state">
                <CommentIcon size={32} />
                <p className="empty-state-title">{all.length === 0 ? "No comments yet" : "No matches"}</p>
                <p className="empty-state-hint">
                  {all.length === 0
                    ? "Add one in the diff, or use “Fetch GitHub comments” to pull existing ones."
                    : "No comments match these filters."}
                </p>
              </div>
            )}
          </li>
        )}
      </ul>
      {outOfRange && (
        <OutOfRangePrompt
          entry={outOfRange}
          href={outOfRange.madeAtSha ? contextHref(outOfRange) : outOfRange.githubUrl}
          onDismiss={() => setOutOfRange(null)}
        />
      )}
    </div>
  );
}

/**
 * The confirmation shown when a clicked comment is not in the current range.
 * Explains the situation and offers to open the comment's own range in a new
 * tab (or GitHub, for comments with no local anchor) without touching the
 * current review's range.
 */
function OutOfRangePrompt(props: {
  entry: AllCommentEntry;
  href: string | null;
  onDismiss: () => void;
}): React.JSX.Element {
  const { entry, href, onDismiss } = props;
  return (
    <div className="oor-prompt" role="dialog" aria-label="Comment outside current range">
      <p className="oor-text">
        This comment on <code>{entry.path ?? "another location"}</code> belongs to a different commit
        range than the one you’re viewing. Showing it here would change your current range, so open
        it separately instead.
      </p>
      <div className="oor-actions">
        {href && (
          <a className="oor-open" href={href} target="_blank" rel="noreferrer" onClick={onDismiss}>
            Open its diff in a new tab <ExternalIcon size={12} />
          </a>
        )}
        <button type="button" className="btn btn-sm" onClick={onDismiss}>Cancel</button>
      </div>
    </div>
  );
}

/** Author-filter choices rendered as a segmented control. */
const AUTHOR_OPTIONS: ReadonlyArray<{ value: AuthorFilter; label: string }> = [
  { value: "all", label: "Everyone" },
  { value: "mine", label: "Me" },
  { value: "others", label: "Others" },
] as const;

/** Narrow a string to a SourceFilter. */
function asSource(v: string): SourceFilter {
  return v === "local" || v === "github" ? v : "all";
}
