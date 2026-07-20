import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatCommitTime } from "@/web/lib/time.ts";
import { CommentComposer } from "./CommentComposer.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { PostMenu } from "./PostMenu.tsx";
import { ConfirmButton } from "./ConfirmButton.tsx";
import { localCommentDomId } from "@/web/lib/commentVisibility.ts";
import type { AnchoredComment } from "@/daemon/reviewService.ts";
import type { PostPreview, PostTarget } from "@/daemon/registry.ts";

/** A single rendered comment with markdown, edit/delete, copy, and post actions. */
export function CommentItem(props: {
  comment: AnchoredComment;
  onEdit: (body: string) => void;
  onDelete: () => void;
  /** Preview where this comment would post; enables the post control when set. */
  previewPost?: (target: PostTarget) => Promise<PostPreview>;
  /** Post this comment to GitHub at the chosen target. */
  onPost?: (target: PostTarget) => void;
}): React.JSX.Element {
  const { comment, onEdit, onDelete, previewPost, onPost } = props;
  const [editing, setEditing] = useState(false);
  const posted: boolean = comment.githubUrl !== null && comment.githubUrl !== undefined;
  const canPost: boolean = !posted && previewPost !== undefined && onPost !== undefined;

  if (editing) {
    return (
      <div className="comment-item" id={localCommentDomId(comment.id)}>
        <CommentComposer
          initial={comment.body}
          submitLabel="Save"
          onSubmit={(body) => { onEdit(body); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="comment-item" id={localCommentDomId(comment.id)}>
      <div className="comment-meta">
        <span className={`badge origin-${posted ? "posted" : "local"}`}>{posted ? "posted to GitHub" : "local draft"}</span>
        <span className="comment-time">{formatCommitTime(new Date(comment.createdAt).toISOString())}</span>
        {comment.githubUrl && <a href={comment.githubUrl} target="_blank" rel="noreferrer">on GitHub</a>}
        <span className="comment-tools">
          {canPost && previewPost && onPost && <PostMenu preview={previewPost} onPost={onPost} />}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <ConfirmButton warning={posted ? "Also deletes it on GitHub." : undefined} onConfirm={onDelete} />
          <CopyButton text={comment.body} className="btn btn-ghost btn-sm" />
        </span>
      </div>
      <div className="comment-body">
        <Markdown remarkPlugins={[remarkGfm]}>{comment.body}</Markdown>
      </div>
    </div>
  );
}
