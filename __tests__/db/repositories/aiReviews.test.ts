import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import {
  aiReviewsRepo,
  type AiReviewsRepo,
  type AiReviewInput,
  type AiReviewRow,
} from "@/db/repositories/aiReviews.ts";

let db: Database;
let repo: AiReviewsRepo;

/** A minimal valid AI review input. */
const base: AiReviewInput = {
  startSha: "sha-a",
  endSha: "sha-b",
  model: "claude-3-opus",
  template: null,
  prompt: null,
  body: "# Review\nLooks fine.",
  createdAt: 1000,
};

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = aiReviewsRepo(db);
});

describe("aiReviewsRepo – create / get", () => {
  test("create returns a numeric id", () => {
    const id = repo.create(base);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  test("get returns the inserted review", () => {
    const id = repo.create(base);
    const row = repo.get(id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(id);
    expect(row!.startSha).toBe("sha-a");
    expect(row!.endSha).toBe("sha-b");
    expect(row!.model).toBe("claude-3-opus");
    expect(row!.template).toBeNull();
    expect(row!.prompt).toBeNull();
    expect(row!.body).toBe("# Review\nLooks fine.");
    expect(row!.createdAt).toBe(1000);
  });

  test("get returns null for unknown id", () => {
    expect(repo.get(9999)).toBeNull();
  });

  test("stores optional template and prompt when provided", () => {
    const id = repo.create({ ...base, template: "adversarial", prompt: "focus on perf" });
    const row = repo.get(id)!;
    expect(row.template).toBe("adversarial");
    expect(row.prompt).toBe("focus on perf");
  });

  test("multiple creates produce distinct ids", () => {
    const id1 = repo.create(base);
    const id2 = repo.create(base);
    expect(id1).not.toBe(id2);
  });
});

describe("aiReviewsRepo – listByRange", () => {
  test("returns reviews matching the sha range", () => {
    repo.create({ ...base, startSha: "sha-a", endSha: "sha-b", createdAt: 1000 });
    repo.create({ ...base, startSha: "sha-a", endSha: "sha-b", createdAt: 2000 });
    repo.create({ ...base, startSha: "sha-c", endSha: "sha-d", createdAt: 3000 });
    const rows = repo.listByRange("sha-a", "sha-b");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.startSha === "sha-a" && r.endSha === "sha-b")).toBe(true);
  });

  test("returns empty array for unknown range", () => {
    repo.create(base);
    expect(repo.listByRange("nope", "nope")).toEqual([]);
  });
});

describe("aiReviewsRepo – listAll", () => {
  test("returns all reviews", () => {
    repo.create(base);
    repo.create({ ...base, startSha: "sha-c", endSha: "sha-d" });
    expect(repo.listAll()).toHaveLength(2);
  });

  test("returns empty array when no reviews", () => {
    expect(repo.listAll()).toEqual([]);
  });
});

describe("aiReviewsRepo – row shape", () => {
  test("returned row has exactly the expected keys", () => {
    const id = repo.create(base);
    const row: AiReviewRow = repo.get(id)!;
    const keys = Object.keys(row).sort();
    expect(keys).toEqual(["body", "createdAt", "endSha", "id", "model", "prompt", "startSha", "template"]);
  });
});
