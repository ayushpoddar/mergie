/**
 * Format an ISO commit timestamp as a compact `YYYY-MM-DD HH:MM` (UTC) string.
 * Returns an empty string for invalid input.
 */
export function formatCommitTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16).replace("T", " ");
}
