import type { PrState } from "@/services/ghPr.ts";

/** How a PR's lifecycle state renders as a badge. */
export interface PrStatusBadge {
  /** Human label shown in the badge. */
  label: string;
  /** State-specific CSS class (paired with the base `pr-status` class). */
  className: string;
}

/** Badge presentation for each PR state. */
const BADGES: Record<PrState, PrStatusBadge> = {
  open: { label: "Open", className: "pr-status-open" },
  merged: { label: "Merged", className: "pr-status-merged" },
  closed: { label: "Closed", className: "pr-status-closed" },
};

/** The label + class for a PR state's status badge. */
export function prStatusBadge(state: PrState): PrStatusBadge {
  return BADGES[state];
}
