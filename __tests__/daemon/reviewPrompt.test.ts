import { describe, expect, test } from "bun:test";
import { buildReviewPrompt } from "@/daemon/reviewPrompt.ts";

const RANGE = { start: "aaa", end: "bbb" };

describe("buildReviewPrompt", () => {
  test("includes the diff instruction and range", () => {
    const out = buildReviewPrompt(null, null, RANGE);
    expect(out).toContain("git diff aaa bbb");
  });

  test("prepends the template prompt when given", () => {
    const out = buildReviewPrompt("Find bugs adversarially.", null, RANGE);
    expect(out.startsWith("Find bugs adversarially.")).toBe(true);
    expect(out).toContain("git diff aaa bbb");
  });

  test("includes the user's focus prompt when given", () => {
    const out = buildReviewPrompt("Template.", "Focus on the auth changes.", RANGE);
    expect(out).toContain("Template.");
    expect(out).toContain("Focus on the auth changes.");
  });
});
