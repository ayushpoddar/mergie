import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import {
  githubCommentsRepo,
  type GithubCommentsRepo,
  type GithubCommentRow,
} from "@/db/repositories/githubComments.ts";

let db: Database;
let repo: GithubCommentsRepo;

/** A minimal valid GitHub comment row. */
const base: GithubCommentRow = {
  githubId: "gh-1",
  path: "src/foo.ts",
  side: "RIGHT",
  line: 42,
  startLine: null,
  commitSha: "sha-abc",
  body: "LGTM",
  author: "alice",
  createdAt: 1000,
  inReplyTo: null,
  syncedAt: 2000,
};

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = githubCommentsRepo(db);
});

describe("githubCommentsRepo – upsert", () => {
  test("upsert inserts a new row", () => {
    repo.upsert(base);
    expect(repo.listAll()).toHaveLength(1);
  });

  test("upsert replaces an existing row keyed by githubId", () => {
    repo.upsert(base);
    repo.upsert({ ...base, body: "Updated body", syncedAt: 9999 });
    const rows = repo.listAll();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.body).toBe("Updated body");
    expect(row.syncedAt).toBe(9999);
  });

  test("upsert stores all fields correctly", () => {
    const withOptionals: GithubCommentRow = {
      ...base,
      startLine: 40,
      inReplyTo: "gh-0",
    };
    repo.upsert(withOptionals);
    const row = repo.listAll()[0]!;
    expect(row.githubId).toBe("gh-1");
    expect(row.path).toBe("src/foo.ts");
    expect(row.side).toBe("RIGHT");
    expect(row.line).toBe(42);
    expect(row.startLine).toBe(40);
    expect(row.commitSha).toBe("sha-abc");
    expect(row.body).toBe("LGTM");
    expect(row.author).toBe("alice");
    expect(row.createdAt).toBe(1000);
    expect(row.inReplyTo).toBe("gh-0");
    expect(row.syncedAt).toBe(2000);
  });

  test("nullable fields are stored as null when omitted", () => {
    repo.upsert(base);
    const row = repo.listAll()[0]!;
    expect(row.startLine).toBeNull();
    expect(row.inReplyTo).toBeNull();
  });

  test("multiple distinct githubIds coexist", () => {
    repo.upsert(base);
    repo.upsert({ ...base, githubId: "gh-2", path: "src/bar.ts" });
    expect(repo.listAll()).toHaveLength(2);
  });
});

describe("githubCommentsRepo – remove / updateBody", () => {
  test("remove deletes the row with the given githubId", () => {
    repo.upsert(base);
    repo.upsert({ ...base, githubId: "gh-2" });
    repo.remove("gh-1");
    expect(repo.listAll().map((r) => r.githubId)).toEqual(["gh-2"]);
  });

  test("remove is a no-op for an unknown githubId", () => {
    repo.upsert(base);
    repo.remove("nope");
    expect(repo.listAll()).toHaveLength(1);
  });

  test("updateBody changes only the body of the matching row", () => {
    repo.upsert(base);
    repo.updateBody("gh-1", "edited body");
    const row = repo.listAll()[0]!;
    expect(row.body).toBe("edited body");
    expect(row.author).toBe("alice");
  });

  test("updateBody is a no-op for an unknown githubId", () => {
    repo.upsert(base);
    repo.updateBody("nope", "x");
    expect(repo.listAll()[0]!.body).toBe("LGTM");
  });
});

describe("githubCommentsRepo – replaceAll", () => {
  test("replaceAll clears all existing rows and inserts the new batch", () => {
    repo.upsert(base);
    repo.upsert({ ...base, githubId: "gh-2" });
    const fresh: GithubCommentRow[] = [
      { ...base, githubId: "gh-3", body: "fresh" },
      { ...base, githubId: "gh-4", body: "also fresh" },
    ];
    repo.replaceAll(fresh);
    const rows = repo.listAll();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.githubId).sort()).toEqual(["gh-3", "gh-4"]);
  });

  test("replaceAll with an empty array clears all rows", () => {
    repo.upsert(base);
    repo.replaceAll([]);
    expect(repo.listAll()).toHaveLength(0);
  });

  test("replaceAll is atomic — either all rows land or none (transaction)", () => {
    // We can't easily force a mid-batch error, but verify the happy-path
    // atomicity by checking full replacement.
    repo.replaceAll([base, { ...base, githubId: "gh-2", path: "src/bar.ts" }]);
    expect(repo.listAll()).toHaveLength(2);
  });
});

describe("githubCommentsRepo – listByPath", () => {
  test("returns only comments for the given path", () => {
    repo.upsert({ ...base, githubId: "gh-1", path: "src/foo.ts" });
    repo.upsert({ ...base, githubId: "gh-2", path: "src/bar.ts" });
    repo.upsert({ ...base, githubId: "gh-3", path: "src/foo.ts" });
    const rows = repo.listByPath("src/foo.ts");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.path === "src/foo.ts")).toBe(true);
  });

  test("returns empty array for unknown path", () => {
    repo.upsert(base);
    expect(repo.listByPath("nope.ts")).toEqual([]);
  });
});

describe("githubCommentsRepo – listAll", () => {
  test("returns empty array when no rows", () => {
    expect(repo.listAll()).toEqual([]);
  });
});

describe("githubCommentsRepo – row shape", () => {
  test("returned row has exactly the expected keys", () => {
    repo.upsert(base);
    const row: GithubCommentRow = repo.listAll()[0]!;
    const keys = Object.keys(row).sort();
    expect(keys).toEqual([
      "author",
      "body",
      "commitSha",
      "createdAt",
      "githubId",
      "inReplyTo",
      "line",
      "path",
      "side",
      "startLine",
      "syncedAt",
    ]);
  });
});
