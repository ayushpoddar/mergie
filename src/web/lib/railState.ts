/** The surfaces the right rail can host, in top-to-bottom order. */
export type RailTab = "comments" | "reviews" | "description" | "search";

/** All rail tabs in the order they appear in the rail. */
export const RAIL_TABS: readonly RailTab[] = ["comments", "reviews", "description", "search"] as const;

/**
 * Compute the next active rail tab after clicking a rail icon.
 *
 * @param current - The currently active tab, or null when the sidebar is
 *   collapsed.
 * @param clicked - The tab whose icon was clicked.
 * @returns The tab to activate, or null to collapse. Clicking the already-active
 *   tab collapses the sidebar; clicking any other tab switches to it (or opens
 *   the sidebar when it was collapsed).
 */
export function nextRailTab(current: RailTab | null, clicked: RailTab): RailTab | null {
  return current === clicked ? null : clicked;
}
