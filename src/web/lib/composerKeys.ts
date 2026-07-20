/** The subset of a keyboard event the composer cares about. */
export interface ComposerKey {
  /** `KeyboardEvent.key` (e.g. "Enter", "Escape"). */
  key: string;
  /** Whether the Command key (macOS) is held. */
  metaKey: boolean;
  /** Whether the Control key is held. */
  ctrlKey: boolean;
}

/** What a keypress in the composer should do. */
export type ComposerIntent = "submit" | "cancel" | null;

/**
 * Map a keydown in a comment composer to an action. Cmd/Ctrl+Enter submits
 * (plain Enter stays a newline, as expected in a multi-line body); Escape
 * cancels. Anything else is `null` (let the textarea handle it). Pure — reads
 * only the passed fields, mutates nothing.
 */
export function composerKeyIntent(event: ComposerKey): ComposerIntent {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) return "submit";
  if (event.key === "Escape") return "cancel";
  return null;
}
