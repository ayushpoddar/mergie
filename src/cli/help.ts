/**
 * A documented command shown in `mergie help`. Each row renders both as a line
 * in the general-help Usage block and, when `topic` is set, as its own
 * `mergie help <topic>` page.
 */
interface CommandDoc {
  /** Usage signature, e.g. `mergie stop`. */
  usage: string;
  /** One-line blurb shown beside the usage in the general help. */
  summary: string;
  /**
   * Name a user types to view this command's dedicated help
   * (`mergie help <topic>`). Absent for rows with no standalone page.
   */
  topic?: string;
  /** Paragraphs shown on the dedicated `mergie help <topic>` page. */
  details: string[];
  /** Extra per-command flag notes ("flag  description") for the dedicated page. */
  flags?: string[];
}

/** Tagline shown at the top of the general help. */
const TAGLINE = "mergie — review GitHub pull requests from a fast local web UI";

/** Global flags shown in the general help's Flags block. */
const GLOBAL_FLAGS: string[] = [
  "--pr <url>     Load a pull request by URL",
  "--no-open      Don't auto-open a browser tab",
  "-h, --help     Show this help",
  "-v, --version  Show the version",
];

/** Every documented command, in the order they appear in the general help. */
const COMMANDS: CommandDoc[] = [
  {
    usage: "mergie [--pr <url>] [--no-open]",
    summary: "Open the review UI",
    topic: "open",
    details: [
      "Starts the mergie daemon (if it isn't already running) and opens the local review UI.",
      "With no arguments it opens the home picker. Pass --pr <url> to load a specific pull request and jump straight into it.",
    ],
    flags: [
      "--pr <url>   Load a pull request by URL",
      "--no-open    Print the ready URL instead of opening a browser tab",
    ],
  },
  {
    usage: "mergie reload [--no-open]",
    summary: "Restart the daemon",
    topic: "reload",
    details: [
      "Stops the running daemon, waits for it to exit, then starts a fresh one and opens the home picker.",
    ],
    flags: ["--no-open    Print the ready URL instead of opening a browser tab"],
  },
  {
    usage: "mergie status",
    summary: "Show daemon + loaded PRs",
    topic: "status",
    details: [
      "Reports whether the daemon is running and lists the pull requests it currently has loaded.",
    ],
  },
  {
    usage: "mergie stop",
    summary: "Stop the daemon",
    topic: "stop",
    details: ["Stops the running daemon. In-flight AI work is allowed to finish first."],
  },
  {
    usage: "mergie help [command]",
    summary: "Show help",
    topic: "help",
    details: ["Shows general help, or detailed help for a specific command."],
  },
  {
    usage: "mergie version",
    summary: "Show the version",
    topic: "version",
    details: ["Prints the installed mergie version."],
  },
];

/** Command names that have a dedicated `mergie help <topic>` page. */
export const HELP_TOPICS: readonly string[] = COMMANDS.flatMap((c) => (c.topic ? [c.topic] : []));

/** Format the version for `mergie version` / `-v` output. */
export function formatVersion(version: string): string {
  return `mergie ${version}`;
}

/**
 * Extract the `version` string from a package.json payload.
 *
 * @throws If the JSON has no string `version` field.
 */
export function parsePackageVersion(json: string): string {
  const parsed: unknown = JSON.parse(json);
  if (parsed !== null && typeof parsed === "object" && "version" in parsed) {
    const { version } = parsed;
    if (typeof version === "string") return version;
  }
  throw new Error("package.json has no string `version` field");
}

/** Pad each usage signature to a common width so the summaries line up. */
function usageBlock(): string {
  const width: number = Math.max(...COMMANDS.map((c) => c.usage.length));
  return COMMANDS.map((c) => `  ${c.usage.padEnd(width)}  ${c.summary}`).join("\n");
}

/** Render the full `mergie help` output. */
export function generalHelp(): string {
  return [
    TAGLINE,
    "",
    "Usage:",
    usageBlock(),
    "",
    "Flags:",
    ...GLOBAL_FLAGS.map((f) => `  ${f}`),
    "",
    "Run `mergie help <command>` for details.",
  ].join("\n");
}

/** Render `mergie help <name>`, or undefined if `name` is not a known command. */
export function commandHelp(name: string): string | undefined {
  const doc: CommandDoc | undefined = COMMANDS.find((c) => c.topic === name);
  if (doc === undefined) return undefined;

  const lines: string[] = [`${doc.usage} — ${doc.summary}`, "", "Usage:", `  ${doc.usage}`, "", ...doc.details];
  if (doc.flags && doc.flags.length > 0) {
    lines.push("", "Flags:", ...doc.flags.map((f) => `  ${f}`));
  }
  return lines.join("\n");
}
