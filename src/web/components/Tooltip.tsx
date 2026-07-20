import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Which side of the trigger the tooltip is placed on. */
export type TooltipPlacement = "left" | "bottom";

/** A resolved on-screen position for the floating tooltip bubble. */
interface TooltipPos {
  /** Viewport x (px) — the bubble's left or right edge depending on placement. */
  x: number;
  /** Viewport y (px) — the bubble's vertical anchor. */
  y: number;
}

/** Gap in px between the trigger and the tooltip bubble. */
const GAP = 8;

/**
 * A near-instant hover/focus tooltip. Wraps a single trigger element and renders
 * the label in a small pill that is **portaled to `document.body`**, so it is
 * never clipped by an ancestor's `clip-path`/`overflow` (e.g. the hunk card).
 * The tooltip appears on `mouseenter`/`focus` with no show-delay (only a tiny
 * CSS fade) and hides immediately on `mouseleave`/`blur`. The trigger keeps its
 * own `aria-label`; the visual bubble is `aria-hidden`.
 */
export function Tooltip(props: {
  /** The text shown in the tooltip bubble. */
  label: string;
  /** Which side of the trigger to place the bubble on. Defaults to "bottom". */
  placement?: TooltipPlacement;
  /** Extra class(es) for the wrapper span (e.g. to make it a full-width block). */
  className?: string;
  /** The single trigger element (a button). */
  children: React.ReactElement;
}): React.JSX.Element {
  const placement: TooltipPlacement = props.placement ?? "bottom";
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<TooltipPos | null>(null);

  const show = (): void => {
    const trigger = wrapRef.current?.firstElementChild;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    setPos(placement === "left"
      ? { x: r.left - GAP, y: r.top + r.height / 2 }
      : { x: r.left + r.width / 2, y: r.bottom + GAP });
  };
  const hide = (): void => setPos(null);

  return (
    <span
      ref={wrapRef}
      className={props.className ? `tooltip-wrap ${props.className}` : "tooltip-wrap"}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {props.children}
      {pos !== null && createPortal(
        <span
          className={`tooltip tooltip-${placement}`}
          aria-hidden="true"
          style={{ left: pos.x, top: pos.y }}
        >
          {props.label}
        </span>,
        document.body,
      )}
    </span>
  );
}
