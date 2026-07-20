import { useState } from "react";
import { ChevronDownIcon } from "./Icons.tsx";
import type { PostPreview, PostTarget } from "@/daemon/registry.ts";

/**
 * A "Post to GitHub" control offering the two targets (the reviewed range-end
 * commit, or the live PR head). Each choice first previews whether the exact
 * line still exists at that target and shows a warning instead of posting when
 * it does not.
 */
export function PostMenu(props: {
  preview: (target: PostTarget) => Promise<PostPreview>;
  onPost: (target: PostTarget) => void;
}): React.JSX.Element {
  const { preview, onPost } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const choose = async (target: PostTarget): Promise<void> => {
    setBusy(true);
    setWarning(null);
    const result: PostPreview = await preview(target);
    setBusy(false);
    if (!result.canPost) {
      setWarning(result.warning ?? "The line no longer exists at this target.");
      return;
    }
    onPost(target);
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Post to GitHub <ChevronDownIcon size={12} />
      </button>
    );
  }

  return (
    <span className="post-menu" role="menu">
      <span className="post-menu-hint">Post as an inline comment on:</span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        title="Pins the comment to the exact code you reviewed (the range's end commit)."
        onClick={() => void choose("end")}
      >Reviewed commit</button>
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        title="Attaches to the latest code on the PR — relocated if the line moved."
        onClick={() => void choose("head")}
      >Latest PR head</button>
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setOpen(false); setWarning(null); }}>Cancel</button>
      {busy && <span className="post-busy">Checking target…</span>}
      {warning && <span className="post-warning">{warning}</span>}
    </span>
  );
}
