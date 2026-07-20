import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config for the mergie web UI.
 *
 * The React app is served by the mergie daemon in production (built into
 * `dist/web`). During development, `vite` runs its own dev server and proxies
 * API + WebSocket calls to the daemon.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4517", changeOrigin: true },
      "/ws": { target: "ws://localhost:4517", ws: true },
    },
  },
});
