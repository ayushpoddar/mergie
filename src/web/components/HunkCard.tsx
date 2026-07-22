import { useEffect, useState } from "react";
import { DiffLines } from "./DiffLines.tsx";
import { CommentComposer } from "./CommentComposer.tsx";
import { CommentItem } from "./CommentItem.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { ChevronDownIcon, ChevronRightIcon, SparkleIcon, EyeIcon, CommentPlusIcon } from "./Icons.tsx";
import type { HunkView } from "@/daemon/reviewService.ts";
import type { PostPreview, PostTarget } from "@/daemon/registry.ts";
import type { AddCommentArgs } from "../state/useReview.ts";

/**
 * A single hunk card: collapse toggle, viewed checkbox (auto-collapse on
 * viewed), whole-hunk comments, and the diff lines with inline line comments.
 */
export function HunkCard(props: {
  path: string;
  hunk: HunkView;
  endSha: string;
  onToggleViewed: (viewed: boolean) => void;
  addComment: (args: AddCommentArgs) => void;
  editComment: (id: number, body: string) => void;
  deleteComment: (id: number) => void;
  onViewFile: (anchorLine: number) => void;
  previewPost: (commentId: number, target: PostTarget) => Promise<PostPreview>;
  postComment: (commentId: number, target: PostTarget) => void;
  replyToThread: (rootGithubId: string, body: string) => void;
  onAskAi: () => void;
  /** When true, force the hunk expanded (e.g. jumped-to from the comments panel). */
  revealed?: boolean;
}): React.JSX.Element {
  const { path, hunk, endSha, onToggleViewed, addComment, editComment, deleteComment, onViewFile } = props;
  const { previewPost, postComment, replyToThread, onAskAi, revealed } = props;
  const [collapsed, setCollapsed] = useState<boolean>(hunk.viewed);
  const [composingHunk, setComposingHunk] = useState(false);
  // A large hunk hides its diff behind a "Load diff" button until asked for.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setCollapsed(hunk.viewed), [hunk.viewed]);
  // Expand (and load) when this hunk is revealed (jumped to) so its comment and
  // the surrounding lines are on screen.
  useEffect(() => { if (revealed) { setCollapsed(false); setLoaded(true); } }, [revealed]);

  const showPlaceholder = hunk.isLarge && !loaded;

  const hunkComments = hunk.comments.filter((c) => c.lineIndex < 0);

  return (
    <section className={hunk.viewed ? "hunk-card viewed" : "hunk-card"}>
      <header className="hunk-header">
        <button type="button" className="hunk-collapse" aria-label={collapsed ? "Expand hunk" : "Collapse hunk"} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronRightIcon size={14} /> : <ChevronDownIcon size={14} />}
        </button>
        <code className="hunk-title">{hunk.header}</code>
        <div className="hunk-actions">
          <HunkAction label="View file" onClick={() => onViewFile(hunk.newStart)}><EyeIcon size={14} /></HunkAction>
          <HunkAction label="Ask AI" onClick={onAskAi}><SparkleIcon size={14} /></HunkAction>
          <HunkAction label="Comment on hunk" onClick={() => setComposingHunk(true)}><CommentPlusIcon size={14} /></HunkAction>
        </div>
        <label className="hunk-viewed">
          <input type="checkbox" checked={hunk.viewed} onChange={(e) => onToggleViewed(e.target.checked)} />
          Viewed
        </label>
      </header>
      {!collapsed && (
        <>
          {hunkComments.map((c) => (
            <div key={c.id} className="hunk-level-comment">
              <CommentItem
                comment={c}
                onEdit={(body) => editComment(c.id, body)}
                onDelete={() => deleteComment(c.id)}
                previewPost={(target) => previewPost(c.id, target)}
                onPost={(target) => postComment(c.id, target)}
              />
            </div>
          ))}
          {composingHunk && (
            <div className="hunk-level-comment">
              <CommentComposer
                onSubmit={(body) => {
                  addComment({ kind: "hunk", side: "RIGHT", path, body, madeAtSha: endSha, hunkHash: hunk.hash });
                  setComposingHunk(false);
                }}
                onCancel={() => setComposingHunk(false)}
              />
            </div>
          )}
          {showPlaceholder ? (
            <div className="large-diff">
              <span className="notice">Large diff hidden — {hunk.changedLines.toLocaleString()} changed lines.</span>
              <button type="button" className="load-diff" onClick={() => setLoaded(true)}>Load diff</button>
            </div>
          ) : (
            <DiffLines
              lines={hunk.lines}
              path={path}
              comments={hunk.comments}
              githubThreads={hunk.githubThreads}
              endSha={endSha}
              onAddComment={addComment}
              onEditComment={editComment}
              onDeleteComment={deleteComment}
              onReplyToThread={replyToThread}
              previewPost={previewPost}
              onPostComment={postComment}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * A hunk-header action rendered icon-only, with a near-instant tooltip (below
 * the icon) revealing its label on hover and keyboard focus. The label is always
 * present for assistive tech via aria-label.
 */
function HunkAction(props: {
  /** Accessible name + the tooltip text. */
  label: string;
  /** Click handler for the action. */
  onClick: () => void;
  /** The action's icon. */
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Tooltip label={props.label} placement="bottom">
      <button type="button" className="hunk-action" aria-label={props.label} onClick={props.onClick}>
        {props.children}
      </button>
    </Tooltip>
  );
}
