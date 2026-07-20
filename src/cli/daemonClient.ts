import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/daemon/router.ts";
import { BIN_PATH, DAEMON_PORT, DAEMON_URL } from "./constants.ts";

/** A typed tRPC client for the local daemon. */
export type DaemonClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/** Build a tRPC client pointed at the local daemon. */
export function makeClient(url: string = DAEMON_URL): DaemonClient {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${url}/trpc` })] });
}

/** Whether a daemon is already answering on the given URL. */
export async function isHealthy(url: string = DAEMON_URL): Promise<boolean> {
  try {
    const res = await fetch(`${url}/trpc/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure a daemon is running: if none is healthy, spawn a detached daemon
 * process and wait until it responds (or time out).
 */
export async function ensureDaemon(url: string = DAEMON_URL): Promise<void> {
  if (await isHealthy(url)) return;
  Bun.spawn(["bun", "run", BIN_PATH, "__daemon"], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
    env: { ...process.env, MERGIE_PORT: String(DAEMON_PORT) },
  }).unref();

  const deadline: number = performance.now() + 15000;
  while (performance.now() < deadline) {
    await Bun.sleep(200);
    if (await isHealthy(url)) return;
  }
  throw new Error("Daemon did not become healthy within 15s");
}
