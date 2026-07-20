import { join, normalize } from "node:path";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.ts";
import { handleChatMessage } from "./chatSocket.ts";
import type { ServerWebSocket } from "bun";
import type { Context } from "./trpc.ts";
import type { PrRegistry } from "./registry.ts";
import { createGhSearchService, type GhSearchService } from "@/services/ghSearch.ts";

/** A running daemon instance. */
export interface DaemonHandle {
  /** The bound port. */
  port: number;
  /** Base URL, e.g. `http://localhost:4517`. */
  url: string;
  /** Stop the server. */
  stop: () => void;
}

/** Options for starting the daemon. */
export interface StartDaemonOptions {
  /** Port to bind (0 = random, useful for tests). */
  port: number;
  /** The PR registry backing the API. */
  registry: PrRegistry;
  /** GitHub PR-search service (defaults to the real `gh`-backed service). */
  search?: GhSearchService;
  /** Called when the `stop` procedure runs (defaults to stopping the server). */
  requestStop?: () => void;
  /** Directory of built static UI assets to serve (optional). */
  staticDir?: string;
}

/** tRPC endpoint prefix. */
const TRPC_PREFIX = "/trpc";

/** WebSocket path for streaming AI chat. */
const CHAT_WS_PATH = "/ws/chat";

/**
 * Start the mergie daemon: serves the tRPC API under `/trpc` and, if
 * `staticDir` is given, the built React UI for all other routes (SPA
 * fallback to `index.html`).
 */
export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonHandle> {
  const ctx: Context = {
    registry: opts.registry,
    search: opts.search ?? createGhSearchService(),
    requestStop: () => opts.requestStop?.(),
  };

  const server = Bun.serve({
    port: opts.port,
    async fetch(req: Request, srv): Promise<Response | undefined> {
      const url = new URL(req.url);
      if (url.pathname === CHAT_WS_PATH) {
        return srv.upgrade(req) ? undefined : new Response("Upgrade failed", { status: 400 });
      }
      if (url.pathname === "/artifact") {
        return serveArtifact(url, opts.registry);
      }
      if (url.pathname === TRPC_PREFIX || url.pathname.startsWith(`${TRPC_PREFIX}/`)) {
        return fetchRequestHandler({
          endpoint: TRPC_PREFIX,
          req,
          router: appRouter,
          createContext: () => Promise.resolve(ctx),
        });
      }
      return serveStatic(url.pathname, opts.staticDir);
    },
    websocket: {
      async message(ws: ServerWebSocket, message: string | Buffer): Promise<void> {
        await handleChatMessage(opts.registry, String(message), (data) => ws.send(JSON.stringify(data)));
      },
    },
  });

  const boundPort: number = server.port ?? opts.port;
  return {
    port: boundPort,
    url: `http://localhost:${boundPort}`,
    stop: () => server.stop(true),
  };
}

/** Serve an AI-generated artifact file (`/artifact?id=<prId>&path=<relPath>`). */
async function serveArtifact(url: URL, registry: PrRegistry): Promise<Response> {
  const id: string | null = url.searchParams.get("id");
  const relPath: string | null = url.searchParams.get("path");
  if (!id || !relPath) return new Response("Bad request", { status: 400 });
  const ws = registry.getWorkspace(id);
  const abs: string | null = ws ? ws.resolveArtifact(relPath) : null;
  if (!abs) return new Response("Not found", { status: 404 });
  const file = Bun.file(abs);
  return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
}

/** Serve a static file from `staticDir`, falling back to `index.html` (SPA). */
async function serveStatic(pathname: string, staticDir?: string): Promise<Response> {
  if (!staticDir) return new Response("Not found", { status: 404 });
  const rel: string = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = Bun.file(join(staticDir, rel === "/" ? "index.html" : rel));
  if (await candidate.exists()) return new Response(candidate);
  return new Response(Bun.file(join(staticDir, "index.html")));
}
