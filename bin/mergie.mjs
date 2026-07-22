#!/usr/bin/env node
// Launcher for the `mergie` command. mergie's real entry point (mergie.ts) runs
// under Bun, but a global install via npm/pnpm may land on a machine without
// Bun — where the Bun shebang would fail with a cryptic "env: bun: not found".
// This launcher runs under whatever the installer's shim uses (node for
// npm/pnpm, bun for bunx / `bun install -g`), checks that Bun is available, and
// either prints install guidance or hands off to `bun <mergie.ts>`.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The real program lives in src/main.ts (this launcher sits in bin/).
const entry = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "main.ts");

const BUN_MISSING = `mergie requires Bun (>= 1.2) to run, but \`bun\` was not found on your PATH.

Install Bun, then re-run mergie:
  curl -fsSL https://bun.sh/install | bash
  # or
  npm install -g bun

See https://bun.sh for details.
`;

const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });
if (probe.error || probe.status !== 0) {
  process.stderr.write(BUN_MISSING);
  process.exit(1);
}

const res = spawnSync("bun", [entry, ...process.argv.slice(2)], { stdio: "inherit" });
if (res.error) {
  process.stderr.write(`mergie: failed to launch bun: ${res.error.message}\n`);
  process.exit(1);
}
process.exit(res.status ?? 1);
