import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

/** Options for one agentic chat turn. */
export interface AiChatOptions {
  /** The user's prompt for this turn. */
  prompt: string;
  /** Model id to run (from the config model list). */
  model: string;
  /** Working directory the agent operates in (the head-checkout worktree). */
  cwd: string;
  /** Extra readable/writable directories (e.g. the base checkout, artifacts dir). */
  additionalDirectories?: string[];
  /** Optional system prompt prepended to the session. */
  systemPrompt?: string;
}

/**
 * A single streamed event from an agentic turn:
 * - `delta`: an incremental token of assistant text, for live display.
 * - `text`: a finalized assistant text block, used as the authoritative
 *   content to persist (independent of whether deltas were emitted).
 * - `activity`: a human-readable note that the agent is doing something
 *   (using a tool), shown while it works so the wait never feels frozen.
 */
export type ChatEvent =
  | { kind: "delta"; text: string }
  | { kind: "text"; text: string }
  | { kind: "activity"; text: string };

/** A stream of raw agent messages (shape narrowed internally). */
export type RawMessageStream = AsyncIterable<unknown>;

/** The injectable boundary: turn chat options into a raw message stream. */
export type QueryRunner = (opts: AiChatOptions) => RawMessageStream;

/** The AI service: run an agentic chat turn and stream back events. */
export interface AiService {
  /** Stream {@link ChatEvent}s as the turn progresses. */
  chat(opts: AiChatOptions): AsyncIterable<ChatEvent>;
}

/** True when the value is a non-null object. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** A short human phrase describing a tool_use block (e.g. "Reading src/app.ts"). */
function describeTool(name: string, input: Record<string, unknown>): string {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  switch (name) {
    case "Read":
      return `Reading ${str(input.file_path)}`;
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return `Editing ${str(input.file_path ?? input.notebook_path)}`;
    case "Bash":
      return `Running: ${trunc(str(input.command), 60)}`;
    case "Grep":
      return `Searching “${trunc(str(input.pattern), 40)}”`;
    case "Glob":
      return `Finding files ${str(input.pattern)}`;
    default:
      return `${name}…`;
  }
}

/** Extract a live text delta from a partial (`stream_event`) message, if any. */
function deltaOf(msg: Record<string, unknown>): ChatEvent[] {
  if (!isRecord(msg.event)) return [];
  const event = msg.event;
  if (event.type !== "content_block_delta" || !isRecord(event.delta)) return [];
  const delta = event.delta;
  if (delta.type === "text_delta" && typeof delta.text === "string") return [{ kind: "delta", text: delta.text }];
  return [];
}

/** Extract finalized text + tool activity from a complete assistant message. */
function assistantEventsOf(msg: Record<string, unknown>): ChatEvent[] {
  if (!isRecord(msg.message)) return [];
  const content: unknown = msg.message.content;
  if (!Array.isArray(content)) return [];
  const out: ChatEvent[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      out.push({ kind: "text", text: block.text });
    } else if (block.type === "tool_use" && typeof block.name === "string") {
      out.push({ kind: "activity", text: describeTool(block.name, isRecord(block.input) ? block.input : {}) });
    }
  }
  return out;
}

/**
 * Map one raw SDK message to zero or more {@link ChatEvent}s. Live text comes
 * from streaming `delta`s; the authoritative persisted text and tool activity
 * come from complete assistant messages. Exported for unit testing.
 */
export function eventsOf(msg: unknown): ChatEvent[] {
  if (!isRecord(msg)) return [];
  if (msg.type === "stream_event") return deltaOf(msg);
  if (msg.type === "assistant") return assistantEventsOf(msg);
  return [];
}

/** The default runner: drive the Claude Agent SDK with full clone access. */
function defaultRunner(opts: AiChatOptions): RawMessageStream {
  return sdkQuery({
    prompt: opts.prompt,
    options: {
      model: opts.model,
      cwd: opts.cwd,
      additionalDirectories: opts.additionalDirectories,
      permissionMode: "auto",
      systemPrompt: opts.systemPrompt,
      // Emit token-level deltas so replies stream as they are generated.
      includePartialMessages: true,
    },
  });
}

/**
 * Create an {@link AiService}. The `runner` seam wraps the Claude Agent SDK by
 * default (using the user's Claude Max login) and is replaced with a fake in
 * tests. `chat` maps each raw message into {@link ChatEvent}s.
 */
export function createAiService(runner: QueryRunner = defaultRunner): AiService {
  return {
    async *chat(opts: AiChatOptions): AsyncIterable<ChatEvent> {
      for await (const msg of runner(opts)) {
        yield* eventsOf(msg);
      }
    },
  };
}
