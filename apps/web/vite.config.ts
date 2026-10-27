import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import * as NodeURL from "node:url";
import { defineConfig } from "vite-plus";

const apiOrigin = process.env.STACKS_API_ORIGIN ?? "http://localhost:8787";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { "~": NodeURL.fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Dev is single-origin: the browser calls /api and Vite forwards it to the worker.
    proxy: { "/api": apiOrigin },
  },
});
