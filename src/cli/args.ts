/** A parsed CLI command. */
export type Command =
  | { kind: "open"; noOpen: boolean }
  | { kind: "review"; url: string; noOpen: boolean }
  | { kind: "reload"; noOpen: boolean }
  | { kind: "stop" }
  | { kind: "status" };

/** Usage text shown on parse errors. */
export const USAGE =
  "Usage: mergie [--pr <pull-request-url>] [--no-open] | mergie reload | mergie stop | mergie status";

/** The flag that suppresses auto-opening the browser tab. */
const NO_OPEN = "--no-open";

/**
 * Parse mergie's CLI arguments into a {@link Command}.
 *
 * With no arguments mergie opens the home picker (no PR selected). `--pr <url>`
 * deep-links into a PR; `reload` restarts the daemon; `--no-open` (valid on any
 * open flow) skips launching the browser.
 *
 * @param argv Arguments after the executable/script (e.g. `process.argv.slice(2)`).
 * @throws If the arguments are unknown, `--pr` has no value, or `--no-open` is
 *   combined with a non-open command (`stop`/`status`).
 */
export function parseArgs(argv: string[]): Command {
  const noOpen: boolean = argv.includes(NO_OPEN);
  const rest: string[] = argv.filter((a) => a !== NO_OPEN);
  const first: string | undefined = rest[0];

  if (first === "stop" || first === "status") {
    if (noOpen) throw new Error(`${NO_OPEN} is not valid with ${first}.\n${USAGE}`);
    return { kind: first };
  }

  if (first === undefined) return { kind: "open", noOpen };
  if (first === "reload") return { kind: "reload", noOpen };

  const url: string | undefined = prUrlFrom(first, rest[1]);
  if (url !== undefined) return { kind: "review", url, noOpen };

  throw new Error(`Unknown command: ${first}\n${USAGE}`);
}

/**
 * Extract a PR URL from a `--pr <url>` pair or a `--pr=<url>` token, or return
 * undefined if `first` is not a `--pr` flag.
 *
 * @throws If a `--pr` flag is present but its value is empty.
 */
function prUrlFrom(first: string, next: string | undefined): string | undefined {
  if (first === "--pr") {
    if (next === undefined || next.length === 0) throw new Error(`Missing PR URL.\n${USAGE}`);
    return next;
  }
  if (first.startsWith("--pr=")) {
    const url: string = first.slice("--pr=".length);
    if (url.length === 0) throw new Error(`Missing PR URL.\n${USAGE}`);
    return url;
  }
  return undefined;
}
