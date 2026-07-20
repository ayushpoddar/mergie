import { describe, expect, test } from "bun:test";
import { createInflight } from "@/daemon/inflight.ts";

describe("createInflight", () => {
  test("tracks the active count across begin/done", () => {
    const f = createInflight();
    expect(f.active()).toBe(0);
    const a = f.begin();
    const b = f.begin();
    expect(f.active()).toBe(2);
    a();
    expect(f.active()).toBe(1);
    b();
    expect(f.active()).toBe(0);
  });

  test("idle resolves immediately (true) when nothing is in flight", async () => {
    expect(await createInflight().idle(1000)).toBe(true);
  });

  test("idle resolves true once the last operation finishes", async () => {
    const f = createInflight();
    const done = f.begin();
    const idle = f.idle(1000);
    done();
    expect(await idle).toBe(true);
  });

  test("idle resolves false when the timeout elapses first", async () => {
    const f = createInflight();
    f.begin(); // never finishes
    expect(await f.idle(20)).toBe(false);
  });

  test("done is idempotent and never drives the count negative", () => {
    const f = createInflight();
    const done = f.begin();
    done();
    done();
    expect(f.active()).toBe(0);
  });
});
