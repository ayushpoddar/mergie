import { describe, expect, test } from "bun:test";
import { fileStatusClass } from "@/web/lib/fileStatus.ts";
import type { FileStatus } from "@/domain/diff.ts";

/** [status, expected variant class] */
const cases: [FileStatus, ReturnType<typeof fileStatusClass>][] = [
  ["added", "added"],
  ["deleted", "deleted"],
  ["modified", "modified"],
  ["renamed", "modified"],
];

describe("fileStatusClass", () => {
  test.each(cases)("maps %s → %s", (status, expected) => {
    expect(fileStatusClass(status)).toBe(expected);
  });
});
