import { HELP_TOPICS } from "./help.ts";

/** A parsed CLI command. */
export type Command =
  | { kind: "open"; noOpen: boolean }
  | { kind: "review"; url: string; noOpen: boolean }
  | { kind: "reload"; noOpen: boolean }
  | { kind: "stop" }
  | { kind: "status" }
  | { kind: "version" }
  | { kind: "help"; command?: string };

/** Pointer shown on parse errors when the whole command line is unclear. */
const HELP_HINT = "Run `mergie help` to see available commands.";

/** Pointer to a specific command's usage, shown on command-specific errors. */
function usageHintFor(command: string): string {
  return `Run \`mergie help ${command}\` for usage.`;
}

/** The flag that suppresses auto-opening the browser tab. */
const NO_OPEN = "--no-open";

/** Flags (in any position) that request help. */
const HELP_FLAGS: readonly string[] = ["-h", "--help"];

/** Flags (in any position) that request the version. */
const VERSION_FLAGS: readonly string[] = ["-v", "--version"];

/**
 * Parse mergie's CLI arguments into a {@link Command}.
 *
 * `-h`/`--help`/`help` and `-v`/`--version`/`version` short-circuit and win over
 * everything else (help beats version when both appear). With no arguments
 * mergie opens the home picker (no PR selected). `--pr <url>` deep-links into a
 * PR; `reload` restarts the daemon; `--no-open` (valid on any open flow) skips
 * launching the browser.
 *
 * @param argv Arguments after the executable/script (e.g. `process.argv.slice(2)`).
 * @throws If the arguments are unknown, `help` names an unknown command, `--pr`
 *   has no value, or `--no-open` is combined with a non-open command
 *   (`stop`/`status`).
 */
export function parseArgs(argv: string[]): Command {
  const help: Command | undefined = parseHelp(argv);
  if (help !== undefined) return help;
  if (argv[0] === "version" || argv.some((a) => VERSION_FLAGS.includes(a))) return { kind: "version" };

  const noOpen: boolean = argv.includes(NO_OPEN);
  const rest: string[] = argv.filter((a) => a !== NO_OPEN);
  const first: string | undefined = rest[0];

  if (first === "stop" || first === "status") {
    if (noOpen) throw new Error(`${NO_OPEN} is not valid with ${first}.\n${usageHintFor(first)}`);
    return { kind: first };
  }

  if (first === undefined) return { kind: "open", noOpen };
  if (first === "reload") return { kind: "reload", noOpen };

  const url: string | undefined = prUrlFrom(first, rest[1]);
  if (url !== undefined) return { kind: "review", url, noOpen };

  throw new Error(`Unknown command: ${first}\n${HELP_HINT}`);
}

/**
 * Detect a help request and resolve its target command. Returns undefined when
 * no help was requested.
 *
 * `help <command>` (subcommand form) names the target explicitly; a `-h`/`--help`
 * flag picks up a known command already on the line (e.g. `mergie stop --help`),
 * otherwise it means general help.
 *
 * @throws If the subcommand form names an unknown command.
 */
function parseHelp(argv: string[]): Command | undefined {
  const byFlag: boolean = argv.some((a) => HELP_FLAGS.includes(a));
  const byWord: boolean = argv[0] === "help";
  if (!byFlag && !byWord) return undefined;

  const target: string | undefined = byWord ? argv[1] : argv.find((a) => HELP_TOPICS.includes(a));
  if (target === undefined) return { kind: "help" };
  if (!HELP_TOPICS.includes(target)) throw new Error(`Unknown command: ${target}\n${HELP_HINT}`);
  return { kind: "help", command: target };
}

/**
 * Extract a PR URL from a `--pr <url>` pair or a `--pr=<url>` token, or return
 * undefined if `first` is not a `--pr` flag.
 *
 * @throws If a `--pr` flag is present but its value is empty.
 */
function prUrlFrom(first: string, next: string | undefined): string | undefined {
  if (first === "--pr") {
    if (next === undefined || next.length === 0) throw new Error(`Missing PR URL.\n${usageHintFor("open")}`);
    return next;
  }
  if (first.startsWith("--pr=")) {
    const url: string = first.slice("--pr=".length);
    if (url.length === 0) throw new Error(`Missing PR URL.\n${usageHintFor("open")}`);
    return url;
  }
  return undefined;
}
