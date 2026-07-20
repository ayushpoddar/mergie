import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import { hunkViewsRepo, type HunkViewsRepo } from "@/db/repositories/hunkViews.ts";

let db: Database;
let repo: HunkViewsRepo;

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = hunkViewsRepo(db);
});

describe("hunkViewsRepo", () => {
  test("marks a hunk viewed and reports it", () => {
    repo.markViewed("h1", 1000);
    expect(repo.isViewed("h1")).toBe(true);
    expect(repo.isViewed("h2")).toBe(false);
  });

  test("lists all viewed hashes", () => {
    repo.markViewed("h1", 1000);
    repo.markViewed("h2", 1001);
    expect(repo.viewedHashes().sort()).toEqual(["h1", "h2"]);
  });

  test("marking twice is idempotent (single row, updated timestamp)", () => {
    repo.markViewed("h1", 1000);
    repo.markViewed("h1", 2000);
    expect(repo.viewedHashes()).toEqual(["h1"]);
  });

  test("unmarks a hunk", () => {
    repo.markViewed("h1", 1000);
    repo.unmarkViewed("h1");
    expect(repo.isViewed("h1")).toBe(false);
  });
});
