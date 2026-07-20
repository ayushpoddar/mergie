import { useEffect, useRef, useState } from "react";
import { CopyIcon, CheckIcon } from "./Icons.tsx";
import { Tooltip } from "./Tooltip.tsx";

/**
 * An icon-only copy-to-clipboard button: shows a copy glyph, briefly swaps to a
 * check on click to confirm the (otherwise silent) clipboard write, and exposes
 * its purpose via a hover tooltip + `aria-label`. Matches the app's small
 * ghost-icon button style.
 *
 * @param props.text  - Text to place on the clipboard.
 * @param props.label - Tooltip + accessible label (e.g. "Copy PR URL").
 * @param props.size  - Icon pixel size (default 13).
 */
export function CopyIconButton(props: { text: string; label: string; size?: number }): React.JSX.Element {
  const { text, label, size = 13 } = props;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = (): void => {
    // navigator.clipboard is undefined outside secure contexts; still confirm
    // rather than let the click throw silently.
    if (navigator.clipboard) void navigator.clipboard.writeText(text);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Tooltip label={copied ? "Copied!" : label} placement="bottom">
      <button type="button" className="icon-copy-btn" aria-label={label} onClick={onClick}>
        {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
      </button>
    </Tooltip>
  );
}
