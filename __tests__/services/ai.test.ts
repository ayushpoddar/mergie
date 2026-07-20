import { describe, expect, test } from "bun:test";
import { createAiService, eventsOf, type AiChatOptions, type ChatEvent, type QueryRunner } from "@/services/ai.ts";

/** A fake runner yielding a canned message sequence and recording its options. */
function fakeRunner(messages: unknown[]) {
  const calls: AiChatOptions[] = [];
  const runner: QueryRunner = (opts) => {
    calls.push(opts);
    return (async function* () { for (const m of messages) yield m; })();
  };
  return { runner, calls };
}

async function collect(stream: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const ev of stream) out.push(ev);
  return out;
}

const OPTS: AiChatOptions = { prompt: "explain this", model: "claude-opus-4-8", cwd: "/wt/head" };

/** Build a partial (streaming) message carrying a text delta. */
function delta(text: string): unknown {
  return { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } };
}

/** Build a complete assistant message with the given content blocks. */
function assistant(...content: unknown[]): unknown {
  return { type: "assistant", message: { content } };
}

describe("eventsOf", () => {
  /** [label, raw message, expected events] */
  const CASES: Array<[string, unknown, ChatEvent[]]> = [
    ["text delta → live delta", delta("Hel"), [{ kind: "delta", text: "Hel" }]],
    ["assistant text block → finalized text", assistant({ type: "text", text: "done" }), [{ kind: "text", text: "done" }]],
    [
      "tool_use Read → activity",
      assistant({ type: "tool_use", name: "Read", input: { file_path: "src/app.ts" } }),
      [{ kind: "activity", text: "Reading src/app.ts" }],
    ],
    [
      "tool_use Bash → activity (command)",
      assistant({ type: "tool_use", name: "Bash", input: { command: "git diff HEAD~1" } }),
      [{ kind: "activity", text: "Running: git diff HEAD~1" }],
    ],
    [
      "tool_use Grep → activity (pattern)",
      assistant({ type: "tool_use", name: "Grep", input: { pattern: "processIrisEvents" } }),
      [{ kind: "activity", text: "Searching “processIrisEvents”" }],
    ],
    [
      "unknown tool → generic activity",
      assistant({ type: "tool_use", name: "WebFetch", input: { url: "https://x" } }),
      [{ kind: "activity", text: "WebFetch…" }],
    ],
    [
      "mixed text + tool_use in one message → text then activity",
      assistant({ type: "text", text: "Let me check." }, { type: "tool_use", name: "Read", input: { file_path: "a.ts" } }),
      [{ kind: "text", text: "Let me check." }, { kind: "activity", text: "Reading a.ts" }],
    ],
    ["system message → nothing", { type: "system", subtype: "init" }, []],
    ["result message → nothing", { type: "result", subtype: "success" }, []],
    ["non-text delta (input_json) → nothing", { type: "stream_event", event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "{" } } }, []],
    ["malformed → nothing", null, []],
  ];
  test.each(CASES)("%s", (_label, msg, expected) => {
    expect(eventsOf(msg)).toEqual(expected);
  });
});

describe("createAiService.chat", () => {
  test("streams deltas live and finalized text blocks across steps", async () => {
    const { runner } = fakeRunner([
      delta("Hello"),
      delta(" world"),
      assistant({ type: "text", text: "Hello world" }),
    ]);
    expect(await collect(createAiService(runner).chat(OPTS))).toEqual([
      { kind: "delta", text: "Hello" },
      { kind: "delta", text: " world" },
      { kind: "text", text: "Hello world" },
    ]);
  });

  test("passes options through to the runner", async () => {
    const { runner, calls } = fakeRunner([]);
    await collect(createAiService(runner).chat({ ...OPTS, additionalDirectories: ["/wt/base"] }));
    expect(calls[0]).toMatchObject({ prompt: "explain this", model: "claude-opus-4-8", cwd: "/wt/head", additionalDirectories: ["/wt/base"] });
  });
});
