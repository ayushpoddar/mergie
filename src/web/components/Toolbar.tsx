import { useCallback, useEffect, useRef, useState } from "react";
import { Switch } from "./Switch.tsx";
import { Tooltip } from "./Tooltip.tsx";
import { useEscToClose } from "@/web/lib/useEscToClose.ts";
import { ChevronDownIcon } from "./Icons.tsx";
import type { VisibilityToggles } from "@/web/lib/visibleFiles.ts";

/** Tooltip explaining that viewed-progress is scoped to each whitespace mode. */
const HIDE_WHITESPACE_HINT =
  "Hide changes that are only whitespace (re-diffs ignoring spacing). " +
  "Viewed-hunk progress is tracked separately for each mode, so hunks may " +
  "reappear as un-viewed when you turn this off — your original marks return unchanged.";

/**
 * The "View" group of visibility filters. To stay compact now that there are
 * four filters, the two most-used ones ("Hide viewed files" and "Hide
 * whitespace changes") are pinned as switches, and the remaining two live in a
 * "More filters" popover whose button carries a count badge when any of them
 * are active.
 */
export function Toolbar(props: {
  toggles: VisibilityToggles;
  onChange: (t: VisibilityToggles) => void;
  hideWhitespace: boolean;
  onHideWhitespaceChange: (value: boolean) => void;
}): React.JSX.Element {
  const { toggles, onChange, hideWhitespace, onHideWhitespaceChange } = props;
  const [moreOpen, setMoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeMore = useCallback(() => setMoreOpen((o) => (o ? false : o)), []);
  useEscToClose(closeMore);

  // Close the popover on any pointer press outside it (bound only while open).
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: PointerEvent): void => {
      const target: Node | null = e.target instanceof Node ? e.target : null;
      if (target && rootRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [moreOpen]);

  const toggleRow = (key: keyof VisibilityToggles, label: string) => (
    <Switch label={label} checked={toggles[key]} onChange={(checked) => onChange({ ...toggles, [key]: checked })} />
  );

  // Filters hidden behind "More"; the badge counts how many are currently on.
  const hiddenActive: number = [toggles.hideViewedHunks, toggles.hideLockFiles].filter(Boolean).length;

  return (
    <div className="toolbar" ref={rootRef}>
      {toggleRow("hideViewedFiles", "Hide viewed files")}
      <Tooltip label={HIDE_WHITESPACE_HINT} placement="bottom" className="tooltip-block">
        <Switch label="Hide whitespace changes" checked={hideWhitespace} onChange={onHideWhitespaceChange} />
      </Tooltip>

      <div className="more-filters">
        <button
          type="button"
          className="more-filters-btn"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        >
          <span>More filters</span>
          {hiddenActive > 0 && <span className="more-filters-badge">{hiddenActive}</span>}
          <ChevronDownIcon size={14} />
        </button>
        {moreOpen && (
          <div className="more-filters-pop">
            {toggleRow("hideViewedHunks", "Hide viewed hunks")}
            {toggleRow("hideLockFiles", "Hide lock files")}
          </div>
        )}
      </div>
    </div>
  );
}
