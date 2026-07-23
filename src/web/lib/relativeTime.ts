/** Thresholds (seconds) and their unit suffix, largest first. */
const UNITS: ReadonlyArray<[seconds: number, suffix: string]> = [
  [365 * 24 * 3600, "y"],
  [30 * 24 * 3600, "mo"],
  [24 * 3600, "d"],
  [3600, "h"],
  [60, "m"],
];

/**
 * Format an ISO-8601 timestamp as a short relative time relative to `nowMs`
 * (epoch ms), e.g. `"5m ago"`, `"3d ago"`, `"2mo ago"`. Anything under a minute
 * — including future timestamps — is `"just now"`. Empty/unparseable input
 * returns `""`.
 */
export function relativeTime(iso: string, nowMs: number): string {
  const then: number = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const secs: number = Math.floor((nowMs - then) / 1000);
  if (secs < 60) return "just now";
  for (const [unitSecs, suffix] of UNITS) {
    if (secs >= unitSecs) return `${Math.floor(secs / unitSecs)}${suffix} ago`;
  }
  return "just now";
}
