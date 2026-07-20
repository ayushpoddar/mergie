import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import {
  commentsRepo,
  type CommentsRepo,
  type CommentInput,
  type CommentRow,
} from "@/db/repositories/comments.ts";

let db: Database;
let repo: CommentsRepo;

/** A valid base comment input for reuse across tests. */
const base: CommentInput = {
  kind: "hunk",
  side: "RIGHT",
  path: "src/foo.ts",
  anchorHash: "anchor-abc",
  startLine: null,
  endLine: null,
  madeAtSha: "sha-1",
  body: "looks good",
  createdAt: 1000,
  updatedAt: 1000,
  githubId: null,
  githubUrl: null,
  inReplyToGithubId: null,
};

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = commentsRepo(db);
});

describe("commentsRepo – create / get", () => {
  test("create returns a numeric id", () => {
    const id = repo.create(base);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  test("get returns the inserted comment", () => {
    const id = repo.create(base);
    const row = repo.get(id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(id);
    expect(row!.kind).toBe("hunk");
    expect(row!.side).toBe("RIGHT");
    expect(row!.path).toBe("src/foo.ts");
    expect(row!.anchorHash).toBe("anchor-abc");
    expect(row!.startLine).toBeNull();
    expect(row!.endLine).toBeNull();
    expect(row!.madeAtSha).toBe("sha-1");
    expect(row!.body).toBe("looks good");
    expect(row!.createdAt).toBe(1000);
    expect(row!.updatedAt).toBe(1000);
    expect(row!.githubId).toBeNull();
    expect(row!.githubUrl).toBeNull();
    expect(row!.inReplyToGithubId).toBeNull();
  });

  test("get returns null for unknown id", () => {
    expect(repo.get(9999)).toBeNull();
  });

  test("stores nullable numeric fields correctly", () => {
    const id = repo.create({ ...base, startLine: 10, endLine: 20 });
    const row = repo.get(id)!;
    expect(row.startLine).toBe(10);
    expect(row.endLine).toBe(20);
  });

  test("stores kind='lines' and side='LEFT'", () => {
    const id = repo.create({ ...base, kind: "lines", side: "LEFT" });
    const row = repo.get(id)!;
    expect(row.kind).toBe("lines");
    expect(row.side).toBe("LEFT");
  });

  test("stores github fields when provided", () => {
    const id = repo.create({
      ...base,
      githubId: "gh-99",
      githubUrl: "https://github.com/.../99",
      inReplyToGithubId: "gh-50",
    });
    const row = repo.get(id)!;
    expect(row.githubId).toBe("gh-99");
    expect(row.githubUrl).toBe("https://github.com/.../99");
    expect(row.inReplyToGithubId).toBe("gh-50");
  });

  test("multiple creates produce distinct ids", () => {
    const id1 = repo.create(base);
    const id2 = repo.create(base);
    expect(id1).not.toBe(id2);
  });
});

describe("commentsRepo – update", () => {
  test("update changes body and updatedAt", () => {
    const id = repo.create(base);
    repo.update(id, { body: "new body", updatedAt: 9000 });
    const row = repo.get(id)!;
    expect(row.body).toBe("new body");
    expect(row.updatedAt).toBe(9000);
    expect(row.createdAt).toBe(1000);
  });

  test("update on unknown id is a no-op", () => {
    repo.update(9999, { body: "x", updatedAt: 1 });
  });
});

describe("commentsRepo – remove", () => {
  test("remove deletes the comment", () => {
    const id = repo.create(base);
    repo.remove(id);
    expect(repo.get(id)).toBeNull();
  });

  test("remove on unknown id is a no-op", () => {
    repo.remove(9999);
  });
});

describe("commentsRepo – listByAnchor", () => {
  test("returns only comments matching the anchor hash", () => {
    repo.create({ ...base, anchorHash: "anchor-1", body: "a" });
    repo.create({ ...base, anchorHash: "anchor-2", body: "b" });
    repo.create({ ...base, anchorHash: "anchor-1", body: "c" });
    const rows = repo.listByAnchor("anchor-1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.body).sort()).toEqual(["a", "c"]);
  });

  test("returns empty array for unknown anchor", () => {
    expect(repo.listByAnchor("nope")).toEqual([]);
  });
});

describe("commentsRepo – listAll", () => {
  test("returns all comments", () => {
    repo.create({ ...base, body: "first" });
    repo.create({ ...base, body: "second" });
    expect(repo.listAll()).toHaveLength(2);
  });

  test("returns empty array when no comments", () => {
    expect(repo.listAll()).toEqual([]);
  });
});

describe("commentsRepo – setGithub / clearGithub", () => {
  test("setGithub updates githubId and githubUrl", () => {
    const id = repo.create(base);
    repo.setGithub(id, { githubId: "gh-1", githubUrl: "https://github.com/.../1" });
    const row = repo.get(id)!;
    expect(row.githubId).toBe("gh-1");
    expect(row.githubUrl).toBe("https://github.com/.../1");
  });

  test("clearGithub nullifies githubId and githubUrl", () => {
    const id = repo.create({
      ...base,
      githubId: "gh-1",
      githubUrl: "https://github.com/.../1",
    });
    repo.clearGithub(id);
    const row = repo.get(id)!;
    expect(row.githubId).toBeNull();
    expect(row.githubUrl).toBeNull();
  });

  test("setGithub on unknown id is a no-op", () => {
    repo.setGithub(9999, { githubId: "x", githubUrl: "x" });
  });

  test("clearGithub on unknown id is a no-op", () => {
    repo.clearGithub(9999);
  });
});

describe("commentsRepo – row shape", () => {
  test("returned row has exactly the expected keys", () => {
    const id = repo.create(base);
    const row: CommentRow = repo.get(id)!;
    const keys = Object.keys(row).sort();
    expect(keys).toEqual([
      "anchorHash",
      "body",
      "createdAt",
      "endLine",
      "githubId",
      "githubUrl",
      "id",
      "inReplyToGithubId",
      "kind",
      "madeAtSha",
      "path",
      "side",
      "startLine",
      "updatedAt",
    ]);
  });
});
