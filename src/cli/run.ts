import type { Command } from "./args.ts";
import { DAEMON_URL, VERSION } from "./constants.ts";
import { ensureDaemon, isHealthy, makeClient } from "./daemonClient.ts";
import { commandHelp, formatVersion, generalHelp } from "./help.ts";
import { openBrowser } from "./openBrowser.ts";
import { bunProbe, runHardChecks, runSoftChecks } from "./preflight.ts";

/** Execute a parsed CLI {@link Command}. */
export async function runCli(cmd: Command): Promise<void> {
  // version/help just print and exit — no daemon, no preflight.
  if (cmd.kind === "version") {
    console.log(formatVersion(VERSION));
    return;
  }
  if (cmd.kind === "help") {
    console.log(cmd.command ? (commandHelp(cmd.command) ?? generalHelp()) : generalHelp());
    return;
  }

  // Hard preflight runs only for flows that start/use the daemon and need gh;
  // stop/status just control an existing daemon and are exempt.
  if (cmd.kind === "review" || cmd.kind === "open" || cmd.kind === "reload") {
    const errors: string[] = await runHardChecks(bunProbe);
    if (errors.length > 0) throw new Error(errors.join("\n\n"));
  }

  if (cmd.kind === "review") return runReview(cmd.url, cmd.noOpen);
  if (cmd.kind === "open") return runOpen(cmd.noOpen);
  if (cmd.kind === "reload") return runReload(cmd.noOpen);
  if (cmd.kind === "stop") return runStop();
  return runStatus();
}

/** Emit a warning for each missing optional tool (rg/sem/claude). */
async function warnMissingOptionalTools(): Promise<void> {
  for (const warning of await runSoftChecks(bunProbe)) {
    console.error(`\nwarning: ${warning}`);
  }
}

/** Open the home picker (no PR selected). */
async function runOpen(noOpen: boolean): Promise<void> {
  await ensureDaemon();
  await warnMissingOptionalTools();
  await maybeOpen(`${DAEMON_URL}/`, noOpen);
}

/** Load a PR by URL and open it directly. */
async function runReview(url: string, noOpen: boolean): Promise<void> {
  await ensureDaemon();
  await warnMissingOptionalTools();
  const pr = await makeClient().loadPr.mutate({ url });
  console.log(`Loaded ${pr.owner}/${pr.repo} #${pr.number}: ${pr.title}`);
  await maybeOpen(`${DAEMON_URL}/?pr=${pr.id}`, noOpen);
}

/** Restart the daemon (stop, wait for exit, then open the home picker). */
async function runReload(noOpen: boolean): Promise<void> {
  await stopAndWait();
  await runOpen(noOpen);
}

async function runStop(): Promise<void> {
  if (!(await isHealthy())) {
    console.log("Daemon is not running.");
    return;
  }
  await makeClient().stop.mutate();
  console.log("Daemon stopping.");
}

async function runStatus(): Promise<void> {
  if (!(await isHealthy())) {
    console.log("Daemon is not running.");
    return;
  }
  const health = await makeClient().health.query();
  console.log(`Daemon running. ${health.prs.length} PR(s) loaded.`);
  for (const pr of health.prs) {
    console.log(`  - ${pr.owner}/${pr.repo} #${pr.number}: ${pr.title}`);
  }
}

/** Open a URL in the browser unless suppressed, always logging the target. */
async function maybeOpen(target: string, noOpen: boolean): Promise<void> {
  if (noOpen) {
    console.log(`Ready at ${target}`);
    return;
  }
  console.log(`Opening ${target}`);
  await openBrowser(target);
}

/** Ask a running daemon to stop, then poll until it stops answering. */
async function stopAndWait(): Promise<void> {
  if (!(await isHealthy())) return;
  await makeClient().stop.mutate();
  const deadline: number = performance.now() + 15000;
  while (performance.now() < deadline) {
    await Bun.sleep(200);
    if (!(await isHealthy())) return;
  }
  throw new Error("Daemon did not stop within 15s");
}
