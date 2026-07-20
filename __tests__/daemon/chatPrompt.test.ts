import { describe, expect, test } from "bun:test";
import { chatTranscript, sessionTitle } from "@/daemon/chatPrompt.ts";

describe("sessionTitle", () => {
  /** [prompt, expected title] */
  const CASES: Array<[string, string]> = [
    ["What does this do?", "What does this do?"],
    ["  trim   and   collapse\n\nwhitespace  ", "trim and collapse whitespace"],
    ["", "New chat"],
    ["   ", "New chat"],
    [
      "Explain in detail how the report export webhook flows through the shared consumer pipeline",
      "Explain in detail how the report export webhook flo…",
    ],
  ];
  test.each(CASES)("%p → %p", (prompt, expected) => {
    expect(sessionTitle(prompt)).toBe(expected);
  });

  test("never exceeds the length cap", () => {
    expect(sessionTitle("x".repeat(200)).length).toBeLessThanOrEqual(52);
  });
});

describe("chatTranscript", () => {
  test("returns the sole user message verbatim for a first turn", () => {
    expect(chatTranscript([{ role: "user", content: "explain hunk" }])).toBe("explain hunk");
  });

  test("renders a labelled transcript for a multi-turn session", () => {
    const out = chatTranscript([
      { role: "user", content: "what does this do?" },
      { role: "assistant", content: "it exports a report" },
      { role: "user", content: "any bugs?" },
    ]);
    expect(out).toBe(
      "User: what does this do?\n\nAssistant: it exports a report\n\nUser: any bugs?",
    );
  });
});
