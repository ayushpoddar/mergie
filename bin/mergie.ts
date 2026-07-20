#!/usr/bin/env bun
import { parseArgs } from "@/cli/args.ts";
import { runCli } from "@/cli/run.ts";

const argv: string[] = process.argv.slice(2);

if (argv[0] === "__daemon") {
  // Internal: run the daemon in the foreground (spawned detached by the CLI).
  const { startDaemon } = await import("@/daemon/server.ts");
  const { createPrRegistry } = await import("@/daemon/createRegistry.ts");
  const { buildWebUi } = await import("@/daemon/buildUi.ts");
  const { DAEMON_PORT, DIST_DIR, ROOT } = await import("@/cli/constants.ts");
  const registry = createPrRegistry();

  // On cold start, rebuild the UI when running from a dev checkout (so source
  // changes are picked up); a published install has no build toolchain and
  // ships a prebuilt UI, which buildWebUi serves as-is without rebuilding.
  await buildWebUi({ root: ROOT });

  /** Flush the stop response, then let in-flight AI work finish before exiting. */
  const shutdown = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const drained: boolean = await registry.drainAi(120_000);
    if (!drained) console.error("mergie: timed out waiting for in-flight AI work; exiting.");
    // Grace so a just-completed request's response can flush before we exit.
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.exit(0);
  };

  const daemon = await startDaemon({
    port: DAEMON_PORT,
    registry,
    requestStop: () => { void shutdown(); },
    staticDir: DIST_DIR,
  });
  console.error(`mergie daemon listening on ${daemon.url}`);
} else {
  try {
    await runCli(parseArgs(argv));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
