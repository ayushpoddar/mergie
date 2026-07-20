/** Result of running an external command. */
export interface CommandResult {
  /** Captured standard output. */
  stdout: string;
  /** Captured standard error. */
  stderr: string;
  /** Process exit code (0 = success). */
  exitCode: number;
}

/** Options for running a command. */
export interface RunOptions {
  /** Working directory to run in. */
  cwd?: string;
  /** String written to the command's stdin. */
  input?: string;
}

/**
 * Abstraction over running external commands (git, gh, sem, rg). Services
 * depend on this interface so tests can inject a fake runner instead of
 * spawning real processes.
 */
export interface CommandRunner {
  run(cmd: string, args: string[], opts?: RunOptions): Promise<CommandResult>;
}

/** The real runner, backed by `Bun.spawn`. */
export const bunRunner: CommandRunner = {
  async run(cmd, args, opts) {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: opts?.cwd,
      stdin: opts?.input != null ? new TextEncoder().encode(opts.input) : undefined,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode: number = await proc.exited;
    return { stdout, stderr, exitCode };
  },
};
