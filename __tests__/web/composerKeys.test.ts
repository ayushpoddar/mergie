import { describe, expect, test } from "bun:test";
import { composerKeyIntent, type ComposerKey } from "@/web/lib/composerKeys.ts";

/** [description, key event fields, expected intent] */
const CASES: Array<[string, ComposerKey, "submit" | "cancel" | null]> = [
  ["Cmd+Enter submits", { key: "Enter", metaKey: true, ctrlKey: false }, "submit"],
  ["Ctrl+Enter submits", { key: "Enter", metaKey: false, ctrlKey: true }, "submit"],
  ["plain Enter is a newline (no intent)", { key: "Enter", metaKey: false, ctrlKey: false }, null],
  ["Escape cancels", { key: "Escape", metaKey: false, ctrlKey: false }, "cancel"],
  ["Cmd+Escape still cancels", { key: "Escape", metaKey: true, ctrlKey: false }, "cancel"],
  ["other keys have no intent", { key: "a", metaKey: false, ctrlKey: false }, null],
  ["Cmd+other has no intent", { key: "s", metaKey: true, ctrlKey: false }, null],
];

describe("composerKeyIntent", () => {
  test.each(CASES)("%s", (_desc, event, expected) => {
    expect(composerKeyIntent(event)).toBe(expected);
  });
});
