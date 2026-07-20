/**
 * A small hand-rolled inline-SVG icon set (no dependency). Every icon inherits
 * the current text color via `stroke="currentColor"` and sizes to the `size`
 * prop (default 16px). Icons are decorative by default (aria-hidden); pass a
 * `title` only where the icon stands alone as a control's label.
 */
interface IconProps {
  /** Pixel width/height of the square icon. Defaults to 16. */
  size?: number;
  /** Extra class name for spacing tweaks at a call site. */
  className?: string;
}

/** Shared SVG wrapper: square viewBox, stroke-based, inherits color. */
function Svg(props: IconProps & { children: React.ReactNode }): React.JSX.Element {
  const { size = 16, className, children } = props;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Circular refresh / re-fetch arrows. */
export function RefreshIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </Svg>
  );
}

/** Two-arrow sync / fetch glyph. */
export function SyncIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  );
}

/** External-link (open in new tab) arrow-out-of-box. */
export function ExternalIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Svg>
  );
}

/** Copy to clipboard: two overlapping document rectangles. */
export function CopyIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

/** Close / dismiss X. */
export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

/** Downward chevron (disclosure / dropdown). */
export function ChevronDownIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

/** Rightward chevron (collapsed disclosure). */
export function ChevronRightIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <polyline points="9 6 15 12 9 18" />
    </Svg>
  );
}

/** Leftward chevron (collapse toward the left edge). */
export function ChevronLeftIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <polyline points="15 6 9 12 15 18" />
    </Svg>
  );
}

/** Sparkle / AI glyph. */
export function SparkleIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.7 1.8L21.5 17.5 19.7 18.2 19 20l-.7-1.8L16.5 17.5 18.3 16.8z" />
    </Svg>
  );
}

/** Speech-bubble comment glyph. */
export function CommentIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </Svg>
  );
}

/** Magnifier search glyph. */
export function SearchIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  );
}

/** Info glyph: a circled "i" (caveats / help). */
export function InfoIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12" y2="8" />
    </Svg>
  );
}

/** Check / done glyph. */
export function CheckIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

/** Generic file glyph (file-status contexts). */
export function FileIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </Svg>
  );
}

/** Inbox / empty-state glyph. */
export function InboxIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  );
}

/** Document / lined-page glyph (PR description). */
export function DocumentIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </Svg>
  );
}

/** Eye / view glyph (open the full file). */
export function EyeIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

/** Speech-bubble with a plus (add a comment on the hunk). */
export function CommentPlusIcon(props: IconProps): React.JSX.Element {
  return (
    <Svg {...props}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
      <line x1="12" y1="8" x2="12" y2="14" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </Svg>
  );
}
