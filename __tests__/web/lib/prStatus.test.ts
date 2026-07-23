import { describe, expect, test } from "bun:test";
import { prStatusBadge } from "@/web/lib/prStatus.ts";
import type { PrState } from "@/services/ghPr.ts";

describe("prStatusBadge", () => {
  const cases: Array<[PrState, string, string]> = [
    ["open", "Open", "pr-status-open"],
    ["merged", "Merged", "pr-status-merged"],
    ["closed", "Closed", "pr-status-closed"],
  ];
  test.each(cases)("%s → %s / %s", (state, label, className) => {
    expect(prStatusBadge(state)).toEqual({ label, className });
  });
});
