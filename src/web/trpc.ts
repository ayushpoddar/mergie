import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/daemon/router.ts";

/** Typed tRPC React hooks for the mergie daemon API. */
export const trpc = createTRPCReact<AppRouter>();
