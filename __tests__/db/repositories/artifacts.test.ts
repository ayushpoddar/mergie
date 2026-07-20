import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import {
  artifactsRepo,
  type ArtifactsRepo,
  type ArtifactInput,
  type ArtifactRow,
} from "@/db/repositories/artifacts.ts";

let db: Database;
let repo: ArtifactsRepo;

/** A minimal valid artifact input (no sessionId). */
const base: ArtifactInput = {
  rangeStartSha: "sha-a",
  rangeEndSha: "sha-b",
  sessionId: null,
  relPath: "artifacts/review.html",
  title: "Review HTML",
  createdAt: 1000,
};

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = artifactsRepo(db);
});

describe("artifactsRepo – create", () => {
  test("create returns a numeric id", () => {
    const id = repo.create(base);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  test("listAll returns the inserted artifact", () => {
    const id = repo.create(base);
    const rows = repo.listAll();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(id);
    expect(row.rangeStartSha).toBe("sha-a");
    expect(row.rangeEndSha).toBe("sha-b");
    expect(row.sessionId).toBeNull();
    expect(row.relPath).toBe("artifacts/review.html");
    expect(row.title).toBe("Review HTML");
    expect(row.createdAt).toBe(1000);
  });

  test("stores sessionId when provided", () => {
    const id = repo.create({ ...base, sessionId: 42 });
    const first = repo.listAll()[0]!;
    expect(first.id).toBe(id);
    expect(first.sessionId).toBe(42);
  });

  test("multiple creates produce distinct ids", () => {
    const id1 = repo.create(base);
    const id2 = repo.create({ ...base, relPath: "artifacts/other.html" });
    expect(id1).not.toBe(id2);
  });
});

describe("artifactsRepo – listByRange", () => {
  test("returns only artifacts matching the sha range", () => {
    repo.create({ ...base, rangeStartSha: "sha-a", rangeEndSha: "sha-b" });
    repo.create({ ...base, rangeStartSha: "sha-a", rangeEndSha: "sha-b", relPath: "other.html" });
    repo.create({ ...base, rangeStartSha: "sha-c", rangeEndSha: "sha-d" });
    const rows = repo.listByRange("sha-a", "sha-b");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.rangeStartSha === "sha-a" && r.rangeEndSha === "sha-b")).toBe(true);
  });

  test("returns empty array for unknown range", () => {
    repo.create(base);
    expect(repo.listByRange("nope", "nope")).toEqual([]);
  });
});

describe("artifactsRepo – listAll", () => {
  test("returns all artifacts", () => {
    repo.create(base);
    repo.create({ ...base, relPath: "x.html" });
    expect(repo.listAll()).toHaveLength(2);
  });

  test("returns empty array when no artifacts", () => {
    expect(repo.listAll()).toEqual([]);
  });
});

describe("artifactsRepo – row shape", () => {
  test("returned row has exactly the expected keys", () => {
    const id = repo.create(base);
    const rows = repo.listAll();
    const row: ArtifactRow = rows.find((r) => r.id === id)!;
    const keys = Object.keys(row).sort();
    expect(keys).toEqual(["createdAt", "id", "rangeEndSha", "rangeStartSha", "relPath", "sessionId", "title"]);
  });
});
