import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CloseIcon, SparkleIcon } from "./Icons.tsx";
import type { ChatState } from "../state/useChat.ts";

/** Format a millisecond timestamp as a short local time (e.g. "2:45 PM"). */
function shortTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** One rendered chat bubble (persisted or streaming). */
function Bubble(props: { role: "user" | "assistant"; content: string; time?: number; children?: React.ReactNode }): React.JSX.Element {
  const { role, content, time, children } = props;
  return (
    <div className={`chat-msg chat-${role}`}>
      <div className="chat-msg-head">
        <span className="chat-role">{role === "user" ? "You" : "AI"}</span>
        {time !== undefined && <span className="chat-time">{shortTime(time)}</span>}
        {content.length > 0 && (
          <button type="button" className="chat-copy btn btn-ghost btn-sm" title="Copy" onClick={() => void navigator.clipboard.writeText(content)}>Copy</button>
        )}
      </div>
      {content.length > 0 && <div className="comment-body"><Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown></div>}
      {children}
    </div>
  );
}

/** Animated "the agent is working" footer: spinner, current activity, elapsed time. */
function Working(props: { activity: string | null; elapsed: number }): React.JSX.Element {
  return (
    <div className="chat-working" role="status">
      <span className="chat-spinner" aria-hidden="true" />
      <span className="chat-working-label">{props.activity ?? "Thinking"}</span>
      <span className="chat-elapsed">{props.elapsed}s</span>
    </div>
  );
}

/**
 * The dockable AI chat panel: session list + model picker, the transcript with
 * a live-streaming reply and agent-activity indicator, and the prompt box.
 */
export function ChatPanel(props: { chat: ChatState }): React.JSX.Element | null {
  const { chat } = props;
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Tick an elapsed-seconds counter while a turn is streaming.
  useEffect(() => {
    if (!chat.streaming) { setElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [chat.streaming]);

  // Keep the latest content in view as the transcript grows / streams.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages, chat.streamText, chat.pending, chat.activity, chat.scope]);

  if (!chat.scope) return null;

  const turnInFlight: boolean = chat.pending !== null;
  const submit = (): void => {
    const text = draft.trim();
    if (text.length === 0 || chat.streaming) return;
    chat.send(text);
    setDraft("");
    taRef.current?.focus();
  };

  return (
    <aside className="chat-panel">
      <header className="chat-panel-header">
        <strong><SparkleIcon size={15} /> AI chat</strong>
        <span className="chat-scope" title={chat.scope.label}>{chat.scope.label}</span>
        <button type="button" className="symbol-panel-close" onClick={chat.close} title="Close" aria-label="Close"><CloseIcon size={16} /></button>
      </header>
      <div className="chat-controls">
        <select value={chat.activeId ?? "new"} onChange={(e) => e.target.value === "new" ? chat.newSession() : chat.selectSession(Number(e.target.value))}>
          <option value="new">+ New session</option>
          {chat.sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <select
          value={chat.model}
          onChange={(e) => chat.setModel(e.target.value)}
          disabled={chat.activeId !== null}
          title={chat.activeId !== null ? "Model is fixed for a session — start a new session to switch" : "Choose the model"}
        >
          {chat.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="chat-transcript">
        {chat.messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} time={m.createdAt} />)}
        {turnInFlight && <Bubble role="user" content={chat.pending ?? ""} />}
        {turnInFlight && (
          <Bubble role="assistant" content={chat.streamText}>
            {chat.streaming && <Working activity={chat.activity} elapsed={elapsed} />}
          </Bubble>
        )}
        {chat.error && <p className="notice chat-error">{chat.error}</p>}
        {chat.messages.length === 0 && !turnInFlight && (
          <div className="empty-state">
            <SparkleIcon size={32} />
            <p className="empty-state-title">Ask about this {chat.scope.kind}</p>
            <p className="empty-state-hint">The AI can read the full code at both versions of the range.</p>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {chat.artifacts.length > 0 && (
        <div className="chat-artifacts">
          <div className="chat-role">Artifacts (this range)</div>
          <ul>
            {chat.artifacts.map((a) => (
              <li key={a.id}>
                <a href={chat.artifactUrl(a.relPath)} target="_blank" rel="noreferrer">{a.title}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="chat-input">
        <textarea
          ref={taRef}
          className="comment-textarea"
          value={draft}
          placeholder="Ask the AI (⌘/Ctrl+Enter to send)…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
        />
        <button type="button" className="btn btn-primary" onClick={submit} disabled={chat.streaming || draft.trim().length === 0}>
          {chat.streaming ? "Working…" : "Send"}
        </button>
      </div>
    </aside>
  );
}
