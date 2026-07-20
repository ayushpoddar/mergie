import type { ChatRole } from "@/db/repositories/chatSessions.ts";

/** Max length of a derived session title (including the trailing ellipsis). */
const TITLE_CAP = 52;

/**
 * Derive a short session title from the first user prompt: whitespace is
 * collapsed and the text is truncated to {@link TITLE_CAP} with an ellipsis.
 * Falls back to "New chat" when the prompt is empty.
 */
export function sessionTitle(prompt: string): string {
  const flat: string = prompt.replace(/\s+/g, " ").trim();
  if (flat.length === 0) return "New chat";
  return flat.length > TITLE_CAP ? `${flat.slice(0, TITLE_CAP - 1)}…` : flat;
}

/** A minimal chat message for transcript rendering. */
export interface TranscriptMessage {
  /** Who sent it. */
  role: ChatRole;
  /** Message content. */
  content: string;
}

/**
 * Render a session's messages into a single prompt for the agent. A first-turn
 * (single user message) is passed through verbatim; multi-turn sessions become
 * a `User:`/`Assistant:`-labelled transcript so the agent has prior context.
 */
export function chatTranscript(messages: TranscriptMessage[]): string {
  if (messages.length === 1 && messages[0]?.role === "user") return messages[0].content;
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
}
