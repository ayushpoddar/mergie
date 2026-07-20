import { initTRPC } from "@trpc/server";
import type { PrRegistry } from "./registry.ts";
import type { GhSearchService } from "@/services/ghSearch.ts";

/** Per-request context passed to every tRPC procedure. */
export interface Context {
  /** The registry of loaded PRs. */
  registry: PrRegistry;
  /** GitHub search for the viewer's open PRs (home picker). */
  search: GhSearchService;
  /** Request daemon shutdown (called by the `stop` procedure). */
  requestStop: () => void;
}

const t = initTRPC.context<Context>().create();

/** Build a tRPC router. */
export const router = t.router;
/** A procedure with no auth/middleware (this is a local single-user tool). */
export const publicProcedure = t.procedure;
