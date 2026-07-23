import { prStatusBadge } from "@/web/lib/prStatus.ts";
import type { PrState } from "@/services/ghPr.ts";

/** A small pill showing a PR's lifecycle state (open / merged / closed). */
export function PrStatusBadge(props: { state: PrState }): React.JSX.Element {
  const { label, className } = prStatusBadge(props.state);
  return <span className={`pr-status ${className}`}>{label}</span>;
}
