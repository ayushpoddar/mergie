import { describe, expect, test } from "bun:test";
import { handleChatMessage, type WorkspaceLookup } from "@/daemon/chatSocket.ts";
import type { Workspace } from "@/daemon/registry.ts";

/** A lookup whose workspace streams an activity note then two text deltas. */
function lookup(over: Partial<Workspace> = {}): WorkspaceLookup {
  const ws = {
    async streamChat(_sessionId: number, _prompt: string, onEvent: (ev: { kind: "delta" | "activity"; text: string }) => void) {
      onEvent({ kind: "activity", text: "Reading a.ts" });
      onEvent({ kind: "delta", text: "A" });
      onEvent({ kind: "delta", text: "B" });
      return "AB";
    },
    ...over,
  } as unknown as Workspace;
  return { getWorkspace: () => ws };
}

async function run(raw: string, look: WorkspaceLookup): Promise<unknown[]> {
  const sent: unknown[] = [];
  await handleChatMessage(look, raw, (d) => sent.push(d));
  return sent;
}

describe("handleChatMessage", () => {
  test("streams activity + chunk events then a done event", async () => {
    const sent = await run(JSON.stringify({ id: "p1", sessionId: 3, prompt: "hi" }), lookup());
    expect(sent).toEqual([
      { type: "activity", text: "Reading a.ts" },
      { type: "chunk", text: "A" },
      { type: "chunk", text: "B" },
      { type: "done" },
    ]);
  });

  test("emits an error event for a malformed request", async () => {
    const sent = await run("not json", lookup());
    expect(sent[0]).toMatchObject({ type: "error" });
  });

  test("emits an error event when the PR is not loaded", async () => {
    const sent = await run(JSON.stringify({ id: "x", sessionId: 1, prompt: "hi" }), { getWorkspace: () => undefined });
    expect(sent[0]).toMatchObject({ type: "error" });
  });

  test("emits an error event when streamChat throws", async () => {
    const boom = lookup({ streamChat: async () => { throw new Error("model down"); } });
    const sent = await run(JSON.stringify({ id: "p1", sessionId: 1, prompt: "hi" }), boom);
    expect(sent[0]).toMatchObject({ type: "error", message: "model down" });
  });
});
