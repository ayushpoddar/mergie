import { useState } from "react";

/**
 * A destructive-action button that requires a second click to confirm. The
 * first click "arms" it, swapping in a confirm/cancel pair (with an optional
 * warning line); confirming fires `onConfirm`, cancelling reverts.
 */
export function ConfirmButton(props: {
  /** Label for the initial (unarmed) button. */
  label?: string;
  /** Label for the armed confirm button. */
  confirmLabel?: string;
  /** Extra warning shown once armed (e.g. "also deletes on GitHub"). */
  warning?: string;
  /** Called when the user confirms. */
  onConfirm: () => void;
}): React.JSX.Element {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(true)}>{props.label ?? "Delete"}</button>;
  }
  return (
    <span className="confirm-inline">
      {props.warning && <span className="confirm-warn">{props.warning}</span>}
      <button type="button" className="btn btn-danger btn-sm" onClick={() => { setArmed(false); props.onConfirm(); }}>
        {props.confirmLabel ?? "Confirm delete"}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}
