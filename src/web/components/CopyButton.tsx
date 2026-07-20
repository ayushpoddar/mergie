import { useEffect, useRef, useState } from "react";

/**
 * A copy-to-clipboard button that briefly confirms the copy by swapping its
 * label to "Copied!" for ~1.2s, then reverting — so the user gets feedback that
 * an otherwise-silent clipboard write actually happened.
 */
export function CopyButton(props: {
  /** Text to place on the clipboard. */
  text: string;
  /** Optional class name for styling parity with sibling buttons. */
  className?: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = (): void => {
    // Guard: navigator.clipboard is undefined outside secure contexts; the
    // confirmation should still show rather than the click throwing silently.
    if (navigator.clipboard) void navigator.clipboard.writeText(props.text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button type="button" className={props.className ?? "btn btn-ghost btn-sm"} onClick={onClick}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
