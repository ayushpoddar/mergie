/** Tracks in-flight long-running operations so shutdown can drain them. */
export interface Inflight {
  /** Mark an operation started; returns an idempotent `done` callback. */
  begin(): () => void;
  /** Number of currently-active operations. */
  active(): number;
  /**
   * Resolve `true` once no operations are in flight, or `false` if `timeoutMs`
   * elapses first. Resolves `true` immediately when already idle.
   */
  idle(timeoutMs: number): Promise<boolean>;
}

/** Create an {@link Inflight} tracker. */
export function createInflight(): Inflight {
  let count = 0;
  let waiters: Array<() => void> = [];

  const settleIfIdle = (): void => {
    if (count === 0) {
      const pending = waiters;
      waiters = [];
      for (const w of pending) w();
    }
  };

  return {
    begin() {
      count += 1;
      let called = false;
      return () => {
        if (called) return;
        called = true;
        count = Math.max(0, count - 1);
        settleIfIdle();
      };
    },
    active: () => count,
    idle(timeoutMs: number) {
      if (count === 0) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (v: boolean): void => { if (!done) { done = true; resolve(v); } };
        waiters.push(() => finish(true));
        setTimeout(() => finish(false), timeoutMs);
      });
    },
  };
}
