import { useState } from "react";
import { composerKeyIntent } from "@/web/lib/composerKeys.ts";

/** A small textarea composer for creating or editing a comment. */
export function CommentComposer(props: {
  initial?: string;
  submitLabel?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string>(props.initial ?? "");
  const empty: boolean = draft.trim().length === 0;
  const submit = (): void => {
    const trimmed: string = draft.trim();
    if (trimmed.length > 0) props.onSubmit(trimmed);
  };
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const intent = composerKeyIntent(e);
    if (intent === "submit") { e.preventDefault(); submit(); }
    else if (intent === "cancel") { e.preventDefault(); props.onCancel(); }
  };
  return (
    <div className="comment-composer">
      <textarea
        className="comment-textarea"
        value={draft}
        placeholder="Leave a comment (markdown · ⌘/Ctrl+Enter to submit · Esc to cancel)…"
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="comment-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={empty} title="⌘/Ctrl+Enter">
          {props.submitLabel ?? "Comment"}
        </button>
        <button type="button" className="btn btn-sm" onClick={props.onCancel} title="Esc">Cancel</button>
      </div>
    </div>
  );
}
