import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../trpc.ts";
import type { ChatMessageRow, ChatScopeKind, ChatSessionRow } from "@/db/repositories/chatSessions.ts";
import type { ArtifactRow } from "@/db/repositories/artifacts.ts";
import type { ModelChoice } from "@/domain/config.ts";

/** A commit range accessor (the range currently in view). */
export type RangeAccessor = () => { start: string; end: string } | null;

/** What a chat session is scoped to. */
export interface ChatScope {
  /** Hunk or file. */
  kind: ChatScopeKind;
  /** Hunk hash or file path. */
  ref: string;
  /** Human label for the panel header. */
  label: string;
}

/** Chat state + actions for the AI chat panel. */
export interface ChatState {
  scope: ChatScope | null;
  open: (scope: ChatScope) => void;
  close: () => void;
  sessions: ChatSessionRow[];
  activeId: number | null;
  selectSession: (id: number) => void;
  newSession: () => void;
  messages: ChatMessageRow[];
  models: ModelChoice[];
  model: string;
  setModel: (m: string) => void;
  streaming: boolean;
  streamText: string;
  pending: string | null;
  /** The agent's most recent activity note (e.g. "Reading src/app.ts"), or null. */
  activity: string | null;
  error: string | null;
  send: (prompt: string) => void;
  /** Artifacts generated under the range currently in view. */
  artifacts: ArtifactRow[];
  /** Build a URL to open an artifact file in a new tab. */
  artifactUrl: (relPath: string) => string;
}

/** The daemon's chat WebSocket URL, derived from the page origin. */
function chatWsUrl(): string {
  const proto: string = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/chat`;
}

/** A parsed chat stream event from the server. */
function parseEvent(raw: string): { type: string; text?: string; message?: string } | null {
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as { type: string; text?: string; message?: string }) : null;
  } catch {
    return null;
  }
}

/**
 * Manage the AI chat panel for a PR: scope, sessions, the selected model, and
 * streaming a turn over the chat WebSocket while persisting via the daemon.
 */
export function useChat(prId: string, getRange: RangeAccessor): ChatState {
  const utils = trpc.useUtils();
  const [scope, setScope] = useState<ChatScope | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [model, setModel] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Set when a turn completes; the next persisted-messages refetch hands off.
  const awaitingPersistRef = useRef(false);

  const config = trpc.config.useQuery({ id: prId });
  const models: ModelChoice[] = useMemo(() => config.data?.models ?? [], [config.data]);
  const sessionsQuery = trpc.listChatSessions.useQuery(
    { id: prId, scopeKind: scope?.kind, scopeRef: scope?.ref },
    { enabled: scope !== null },
  );
  const messagesQuery = trpc.listChatMessages.useQuery(
    { id: prId, sessionId: activeId ?? -1 },
    { enabled: activeId !== null },
  );
  const create = trpc.createChatSession.useMutation();
  const range = getRange();
  const artifactsQuery = trpc.listArtifacts.useQuery(
    { id: prId, start: range?.start, end: range?.end },
    { enabled: scope !== null },
  );

  // Default the model to the first configured choice once loaded.
  useEffect(() => { if (!model && models[0]) setModel(models[0].id); }, [models, model]);

  // Tear down any open socket on unmount.
  useEffect(() => () => wsRef.current?.close(), []);

  const stream = (sessionId: number, prompt: string): void => {
    setPending(prompt);
    setStreamText("");
    setActivity(null);
    setStreaming(true);
    setError(null);
    const ws = new WebSocket(chatWsUrl());
    wsRef.current = ws;
    const current = getRange();
    ws.onopen = () => ws.send(JSON.stringify({ id: prId, sessionId, prompt, range: current ?? undefined }));
    ws.onmessage = (ev: MessageEvent) => {
      const msg = parseEvent(String(ev.data));
      if (!msg) return;
      if (msg.type === "chunk") setStreamText((t) => t + (msg.text ?? ""));
      else if (msg.type === "activity") setActivity(msg.text ?? null);
      else if (msg.type === "done") { finish(true); ws.close(); }
      else if (msg.type === "error") { setError(msg.message ?? "Chat failed."); finish(false); ws.close(); }
    };
    ws.onerror = () => { setError("Chat connection failed."); finish(false); };
  };

  // End the turn's "working" state. On success, keep the streamed reply + prompt
  // on screen and mark that we're awaiting the persisted copy, so the assistant
  // bubble never blinks out before the refetch lands. On failure, clear now.
  const finish = (persisted: boolean): void => {
    setStreaming(false);
    setActivity(null);
    if (persisted) awaitingPersistRef.current = true;
    else { setPending(null); setStreamText(""); }
    void utils.listChatMessages.invalidate();
    void utils.listChatSessions.invalidate();
    void utils.listArtifacts.invalidate();
  };

  // When the persisted messages refetch lands after a completed turn, hand off
  // from the transient stream state to the stored transcript (no flicker). Keyed
  // only on the data change so a mid-turn refetch (e.g. a new session's first
  // fetch) never clears an in-flight bubble.
  useEffect(() => {
    if (!awaitingPersistRef.current) return;
    awaitingPersistRef.current = false;
    setPending(null);
    setStreamText("");
  }, [messagesQuery.data]);

  const send = async (prompt: string): Promise<void> => {
    let sessionId: number | null = activeId;
    if (sessionId === null) {
      if (!scope || !model) return;
      const res = await create.mutateAsync({ id: prId, scopeKind: scope.kind, scopeRef: scope.ref, model });
      sessionId = res.sessionId;
      setActiveId(sessionId);
      await utils.listChatSessions.invalidate();
    }
    stream(sessionId, prompt);
  };

  return {
    scope,
    open: (s) => { setScope(s); setActiveId(null); },
    close: () => { setScope(null); setActiveId(null); wsRef.current?.close(); },
    sessions: sessionsQuery.data ?? [],
    activeId,
    selectSession: (id) => setActiveId(id),
    newSession: () => setActiveId(null),
    messages: messagesQuery.data ?? [],
    models,
    model,
    setModel,
    streaming,
    streamText,
    pending,
    activity,
    error,
    send: (prompt) => void send(prompt),
    artifacts: artifactsQuery.data ?? [],
    artifactUrl: (relPath) => `/artifact?id=${encodeURIComponent(prId)}&path=${encodeURIComponent(relPath)}`,
  };
}
