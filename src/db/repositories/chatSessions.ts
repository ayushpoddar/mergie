import type { Database } from "bun:sqlite";

/**
 * The scope kind for a chat session — whether it was started from a hunk or a
 * whole file.
 *
 * - `'hunk'` — session scoped to a single hunk (scopeRef is the hunk hash).
 * - `'file'` — session scoped to a file (scopeRef is the repo-relative path).
 */
export type ChatScopeKind = "hunk" | "file";

/**
 * The role of a chat participant.
 *
 * - `'user'` — message sent by the user.
 * - `'assistant'` — message from the AI model.
 */
export type ChatRole = "user" | "assistant";

/**
 * Input required to create a new chat session. Timestamps are supplied by the
 * caller to remain deterministic in tests.
 */
export interface ChatSessionInput {
  /** Whether the session was started from a hunk or a file. */
  scopeKind: ChatScopeKind;
  /** Hunk hash (when scopeKind='hunk') or repo-relative file path (when 'file'). */
  scopeRef: string;
  /** Short title summarising the session purpose. */
  title: string;
  /** Model identifier used in this session (e.g. `'claude-3-opus'`). */
  model: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
}

/**
 * A fully-hydrated chat session row as returned by the repository.
 * Extends {@link ChatSessionInput} with the auto-generated id.
 */
export interface ChatSessionRow extends ChatSessionInput {
  /** Auto-increment primary key. */
  id: number;
}

/**
 * Input required to add a message to an existing chat session. Timestamps are
 * supplied by the caller.
 */
export interface ChatMessageInput {
  /** Foreign key referencing the parent chat_session.id. */
  sessionId: number;
  /** Who sent the message. */
  role: ChatRole;
  /** Markdown content of the message. */
  content: string;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
}

/**
 * A fully-hydrated chat message row as returned by the repository.
 * Extends {@link ChatMessageInput} with the auto-generated id.
 */
export interface ChatMessageRow extends ChatMessageInput {
  /** Auto-increment primary key. */
  id: number;
}

/** Persistence for AI chat sessions and their messages. */
export interface ChatSessionsRepo {
  /** Persist a new chat session and return its auto-generated id. */
  createSession(input: ChatSessionInput): number;
  /** Fetch a chat session by id; returns null if not found. */
  getSession(id: number): ChatSessionRow | null;
  /** All chat sessions in the database. */
  listSessions(): ChatSessionRow[];
  /** All sessions with the given scopeKind and scopeRef. */
  listSessionsByScope(scopeKind: ChatScopeKind, scopeRef: string): ChatSessionRow[];
  /** Rename a session. No-op if the id does not exist. */
  setTitle(id: number, title: string): void;
  /** Append a message to an existing session and return its auto-generated id. */
  addMessage(input: ChatMessageInput): number;
  /** All messages for a session ordered by createdAt ascending. */
  listMessages(sessionId: number): ChatMessageRow[];
}

/** Raw DB row for the chat_session table. */
interface SessionDbRow {
  id: number;
  scope_kind: string;
  scope_ref: string;
  title: string;
  model: string;
  created_at: number;
}

/** Raw DB row for the chat_message table. */
interface MessageDbRow {
  id: number;
  session_id: number;
  role: string;
  content: string;
  created_at: number;
}

/** Map a raw DB row to the public {@link ChatSessionRow} shape. */
function toSessionRow(r: SessionDbRow): ChatSessionRow {
  return {
    id: r.id,
    scopeKind: r.scope_kind as ChatScopeKind,
    scopeRef: r.scope_ref,
    title: r.title,
    model: r.model,
    createdAt: r.created_at,
  };
}

/** Map a raw DB row to the public {@link ChatMessageRow} shape. */
function toMessageRow(r: MessageDbRow): ChatMessageRow {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as ChatRole,
    content: r.content,
    createdAt: r.created_at,
  };
}

/** Create a {@link ChatSessionsRepo} backed by the given database. */
export function chatSessionsRepo(db: Database): ChatSessionsRepo {
  const insertSession = db.query<{ id: number }, [string, string, string, string, number]>(`
    INSERT INTO chat_session (scope_kind, scope_ref, title, model, created_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `);

  const selectSession = db.query<SessionDbRow, [number]>(
    "SELECT * FROM chat_session WHERE id = ?",
  );

  const allSessions = db.query<SessionDbRow, []>("SELECT * FROM chat_session");

  const sessionsByScope = db.query<SessionDbRow, [string, string]>(
    "SELECT * FROM chat_session WHERE scope_kind = ? AND scope_ref = ?",
  );

  const updateTitle = db.query("UPDATE chat_session SET title = ? WHERE id = ?");

  const insertMessage = db.query<{ id: number }, [number, string, string, number]>(`
    INSERT INTO chat_message (session_id, role, content, created_at)
    VALUES (?, ?, ?, ?)
    RETURNING id
  `);

  const messagesBySession = db.query<MessageDbRow, [number]>(
    "SELECT * FROM chat_message WHERE session_id = ? ORDER BY created_at ASC",
  );

  return {
    createSession(input) {
      const result = insertSession.get(
        input.scopeKind,
        input.scopeRef,
        input.title,
        input.model,
        input.createdAt,
      );
      return result!.id;
    },
    getSession(id) {
      const row = selectSession.get(id);
      return row ? toSessionRow(row) : null;
    },
    listSessions() {
      return allSessions.all().map(toSessionRow);
    },
    listSessionsByScope(scopeKind, scopeRef) {
      return sessionsByScope.all(scopeKind, scopeRef).map(toSessionRow);
    },
    setTitle(id, title) {
      updateTitle.run(title, id);
    },
    addMessage(input) {
      const result = insertMessage.get(
        input.sessionId,
        input.role,
        input.content,
        input.createdAt,
      );
      return result!.id;
    },
    listMessages(sessionId) {
      return messagesBySession.all(sessionId).map(toMessageRow);
    },
  };
}
