import { bunRunner, type CommandRunner } from "@/services/exec.ts";

/**
 * Open a URL in the default browser (macOS `open`).
 *
 * @param url    URL to open.
 * @param runner Command runner (injectable for tests).
 */
export async function openBrowser(url: string, runner: CommandRunner = bunRunner): Promise<void> {
  await runner.run("open", [url]);
}
