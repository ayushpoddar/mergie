import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { openDatabase } from "@/db/migrate.ts";
import {
  chatSessionsRepo,
  type ChatSessionsRepo,
  type ChatSessionInput,
  type ChatSessionRow,
  type ChatMessageInput,
  type ChatMessageRow,
} from "@/db/repositories/chatSessions.ts";

let db: Database;
let repo: ChatSessionsRepo;

/** A valid base session input. */
const baseSession: ChatSessionInput = {
  scopeKind: "hunk",
  scopeRef: "abc-hash",
  title: "Review hunk",
  model: "claude-3-opus",
  createdAt: 1000,
};

beforeEach(() => {
  db = openDatabase(":memory:");
  repo = chatSessionsRepo(db);
});

describe("chatSessionsRepo – createSession / getSession", () => {
  test("createSession returns a numeric id", () => {
    const id = repo.createSession(baseSession);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  test("getSession returns the inserted session", () => {
    const id = repo.createSession(baseSession);
    const row = repo.getSession(id);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(id);
    expect(row!.scopeKind).toBe("hunk");
    expect(row!.scopeRef).toBe("abc-hash");
    expect(row!.title).toBe("Review hunk");
    expect(row!.model).toBe("claude-3-opus");
    expect(row!.createdAt).toBe(1000);
  });

  test("getSession returns null for unknown id", () => {
    expect(repo.getSession(9999)).toBeNull();
  });

  test("scopeKind='file' is stored correctly", () => {
    const id = repo.createSession({ ...baseSession, scopeKind: "file", scopeRef: "src/foo.ts" });
    expect(repo.getSession(id)!.scopeKind).toBe("file");
    expect(repo.getSession(id)!.scopeRef).toBe("src/foo.ts");
  });

  test("multiple sessions have distinct ids", () => {
    const id1 = repo.createSession(baseSession);
    const id2 = repo.createSession(baseSession);
    expect(id1).not.toBe(id2);
  });
});

describe("chatSessionsRepo – listSessions", () => {
  test("returns all sessions", () => {
    repo.createSession(baseSession);
    repo.createSession({ ...baseSession, title: "Another" });
    expect(repo.listSessions()).toHaveLength(2);
  });

  test("returns empty array when no sessions", () => {
    expect(repo.listSessions()).toEqual([]);
  });
});

describe("chatSessionsRepo – listSessionsByScope", () => {
  test("returns only sessions matching scopeKind and scopeRef", () => {
    repo.createSession({ ...baseSession, scopeKind: "hunk", scopeRef: "hash-1" });
    repo.createSession({ ...baseSession, scopeKind: "hunk", scopeRef: "hash-1" });
    repo.createSession({ ...baseSession, scopeKind: "hunk", scopeRef: "hash-2" });
    repo.createSession({ ...baseSession, scopeKind: "file", scopeRef: "hash-1" });
    const rows = repo.listSessionsByScope("hunk", "hash-1");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.scopeKind === "hunk" && r.scopeRef === "hash-1")).toBe(true);
  });

  test("returns empty array for unknown scope", () => {
    repo.createSession(baseSession);
    expect(repo.listSessionsByScope("file", "nope")).toEqual([]);
  });
});

describe("chatSessionsRepo – addMessage / listMessages", () => {
  test("addMessage returns a numeric id", () => {
    const sessionId = repo.createSession(baseSession);
    const msgId = repo.addMessage({ sessionId, role: "user", content: "hello", createdAt: 2000 });
    expect(typeof msgId).toBe("number");
    expect(msgId).toBeGreaterThan(0);
  });

  test("listMessages returns messages for a session ordered by createdAt asc", () => {
    const sessionId = repo.createSession(baseSession);
    repo.addMessage({ sessionId, role: "user", content: "q1", createdAt: 3000 });
    repo.addMessage({ sessionId, role: "assistant", content: "a1", createdAt: 1000 });
    repo.addMessage({ sessionId, role: "user", content: "q2", createdAt: 2000 });
    const msgs = repo.listMessages(sessionId);
    expect(msgs).toHaveLength(3);
    expect(msgs.map((m) => m.createdAt)).toEqual([1000, 2000, 3000]);
    expect(msgs.map((m) => m.role)).toEqual(["assistant", "user", "user"]);
  });

  test("listMessages returns only messages for the given session", () => {
    const s1 = repo.createSession(baseSession);
    const s2 = repo.createSession(baseSession);
    repo.addMessage({ sessionId: s1, role: "user", content: "for s1", createdAt: 1000 });
    repo.addMessage({ sessionId: s2, role: "user", content: "for s2", createdAt: 1000 });
    const s1Messages = repo.listMessages(s1);
    expect(s1Messages).toHaveLength(1);
    expect(s1Messages[0]!.content).toBe("for s1");
  });

  test("listMessages returns empty array for session with no messages", () => {
    const id = repo.createSession(baseSession);
    expect(repo.listMessages(id)).toEqual([]);
  });

  test("listMessages returns empty array for unknown session id", () => {
    expect(repo.listMessages(9999)).toEqual([]);
  });

  test("message row has correct shape", () => {
    const sessionId = repo.createSession(baseSession);
    const msgId = repo.addMessage({ sessionId, role: "user", content: "hi", createdAt: 1000 });
    const msgs = repo.listMessages(sessionId);
    const msg: ChatMessageRow = msgs[0]!;
    expect(Object.keys(msg).sort()).toEqual(["content", "createdAt", "id", "role", "sessionId"]);
    expect(msg.id).toBe(msgId);
    expect(msg.sessionId).toBe(sessionId);
  });
});

describe("chatSessionsRepo – setTitle", () => {
  test("renames an existing session", () => {
    const id = repo.createSession(baseSession);
    repo.setTitle(id, "Renamed session");
    expect(repo.getSession(id)!.title).toBe("Renamed session");
  });

  test("is a no-op for an unknown session id", () => {
    const id = repo.createSession(baseSession);
    repo.setTitle(9999, "nope");
    expect(repo.getSession(id)!.title).toBe(baseSession.title);
  });
});

describe("chatSessionsRepo – row shapes", () => {
  test("session row has exactly the expected keys", () => {
    const id = repo.createSession(baseSession);
    const row: ChatSessionRow = repo.getSession(id)!;
    expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "model", "scopeKind", "scopeRef", "title"]);
  });
});
