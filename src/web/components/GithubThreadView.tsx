import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatCommitTime } from "@/web/lib/time.ts";
import { CommentComposer } from "./CommentComposer.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { CommentIcon } from "./Icons.tsx";
import { githubCommentDomId } from "@/web/lib/commentVisibility.ts";
import type { AnchoredGithubThread } from "@/daemon/reviewService.ts";
import type { ThreadComment } from "@/daemon/githubThreads.ts";

/** Render a single GitHub comment (author, time, GitHub link, markdown body). */
function GhComment(props: { comment: ThreadComment }): React.JSX.Element {
  const { comment } = props;
  return (
    <div className="gh-comment">
      <div className="comment-meta">
        <strong>{comment.author || "unknown"}</strong>
        {comment.createdAt !== null && (
          <span className="comment-time">{formatCommitTime(new Date(comment.createdAt).toISOString())}</span>
        )}
        <a href={comment.htmlUrl} target="_blank" rel="noreferrer">on GitHub</a>
        <span className="comment-tools"><CopyButton text={comment.body} /></span>
      </div>
      <div className="comment-body">
        <Markdown remarkPlugins={[remarkGfm]}>{comment.body}</Markdown>
      </div>
    </div>
  );
}

/** A synced GitHub inline thread with its replies and a reply composer. */
export function GithubThreadView(props: {
  thread: AnchoredGithubThread;
  onReply: (body: string) => void;
}): React.JSX.Element {
  const { thread, onReply } = props;
  const [replying, setReplying] = useState(false);

  return (
    <div className="gh-thread" id={githubCommentDomId(thread.root.githubId)}>
      <div className="gh-thread-tag"><CommentIcon size={11} /> GitHub thread</div>
      <GhComment comment={thread.root} />
      {thread.replies.map((r) => <GhComment key={r.githubId} comment={r} />)}
      {replying ? (
        <CommentComposer
          submitLabel="Reply"
          onSubmit={(body) => { onReply(body); setReplying(false); }}
          onCancel={() => setReplying(false)}
        />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplying(true)}>Reply</button>
      )}
    </div>
  );
}
