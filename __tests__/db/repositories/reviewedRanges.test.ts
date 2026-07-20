import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import { reviewedRangesRepo, type ReviewedRangesRepo, type ReviewedRangeRow } from "@/db/repositories/reviewedRanges.ts";

let db: Database;
let repo: ReviewedRangesRepo;

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = reviewedRangesRepo(db);
});

describe("reviewedRangesRepo", () => {
  test("add and list a reviewed range", () => {
    repo.add("sha-a", "sha-b", 1000);
    const rows = repo.list();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.startSha).toBe("sha-a");
    expect(row.endSha).toBe("sha-b");
    expect(row.createdAt).toBe(1000);
    expect(typeof row.id).toBe("number");
  });

  test("list is ordered by createdAt ascending", () => {
    repo.add("sha-a", "sha-b", 3000);
    repo.add("sha-c", "sha-d", 1000);
    repo.add("sha-e", "sha-f", 2000);
    const rows = repo.list();
    expect(rows.map((r) => r.createdAt)).toEqual([1000, 2000, 3000]);
  });

  test("add is INSERT OR IGNORE — duplicate (startSha, endSha) is silently skipped", () => {
    repo.add("sha-a", "sha-b", 1000);
    repo.add("sha-a", "sha-b", 2000);
    const listed = repo.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.createdAt).toBe(1000);
  });

  test("same startSha with different endSha are distinct rows", () => {
    repo.add("sha-a", "sha-b", 1000);
    repo.add("sha-a", "sha-c", 2000);
    expect(repo.list()).toHaveLength(2);
  });

  test("remove deletes a range by id", () => {
    repo.add("sha-a", "sha-b", 1000);
    const [row] = repo.list() as [ReviewedRangeRow];
    repo.remove(row.id);
    expect(repo.list()).toHaveLength(0);
  });

  test("remove a non-existent id is a no-op", () => {
    repo.add("sha-a", "sha-b", 1000);
    repo.remove(9999);
    expect(repo.list()).toHaveLength(1);
  });

  test("returned row has the correct shape", () => {
    repo.add("sha-x", "sha-y", 5000);
    const row: ReviewedRangeRow = repo.list()[0]!;
    expect(Object.keys(row).sort()).toEqual(["createdAt", "endSha", "id", "startSha"]);
  });

  test("removeByRange deletes the matching (startSha, endSha) pair", () => {
    repo.add("sha-a", "sha-b", 1000);
    repo.add("sha-c", "sha-d", 2000);
    repo.removeByRange("sha-a", "sha-b");
    const rows = repo.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.startSha).toBe("sha-c");
  });

  test("removeByRange only removes an exact endpoint match", () => {
    repo.add("sha-a", "sha-b", 1000);
    repo.removeByRange("sha-a", "sha-x"); // same start, different end
    repo.removeByRange("sha-x", "sha-b"); // same end, different start
    expect(repo.list()).toHaveLength(1);
  });

  test("removeByRange for a non-existent range is a no-op", () => {
    repo.add("sha-a", "sha-b", 1000);
    repo.removeByRange("nope", "nope");
    expect(repo.list()).toHaveLength(1);
  });
});
