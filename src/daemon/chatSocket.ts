import type { Workspace } from "./registry.ts";

/** The minimal registry surface the chat socket needs. */
export interface WorkspaceLookup {
  /** Resolve a loaded PR's workspace by id. */
  getWorkspace(id: string): Workspace | undefined;
}

/** A parsed chat streaming request from the WebSocket client. */
interface ChatRequest {
  /** PR id whose workspace to run the chat in. */
  id: string;
  /** Chat session id. */
  sessionId: number;
  /** The user's prompt. */
  prompt: string;
  /** The commit range in view, so generated artifacts can be linked to it. */
  range?: { start: string; end: string };
}

/** True when the value is a non-null object. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Parse a raw WS frame into a ChatRequest, or null when malformed. */
function parseRequest(raw: string): ChatRequest | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isRecord(v) && typeof v.id === "string" && typeof v.sessionId === "number" && typeof v.prompt === "string") {
    return { id: v.id, sessionId: v.sessionId, prompt: v.prompt, range: parseRange(v.range) };
  }
  return null;
}

/** Parse an optional `{start,end}` range. */
function parseRange(v: unknown): { start: string; end: string } | undefined {
  if (isRecord(v) && typeof v.start === "string" && typeof v.end === "string") return { start: v.start, end: v.end };
  return undefined;
}

/**
 * Handle one chat streaming request: resolve the workspace, stream assistant
 * text as `{type:'chunk'}` events, then a `{type:'done'}` event; any failure is
 * reported as a single `{type:'error'}` event. Transport-agnostic — `send` is
 * the only side-effect, so this is unit-tested without a real socket.
 */
export async function handleChatMessage(
  lookup: WorkspaceLookup,
  raw: string,
  send: (data: unknown) => void,
): Promise<void> {
  const req = parseRequest(raw);
  if (!req) {
    send({ type: "error", message: "Malformed chat request." });
    return;
  }
  const workspace = lookup.getWorkspace(req.id);
  if (!workspace) {
    send({ type: "error", message: `PR not loaded: ${req.id}` });
    return;
  }
  try {
    await workspace.streamChat(
      req.sessionId,
      req.prompt,
      (ev) => send(ev.kind === "activity" ? { type: "activity", text: ev.text } : { type: "chunk", text: ev.text }),
      req.range,
    );
    send({ type: "done" });
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}
