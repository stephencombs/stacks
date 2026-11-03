import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as NodeURL from "node:url";
import { defineConfig } from "vite-plus";

const web = NodeURL.fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
  root: web,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "~": web + "src" } },
  build: {
    outDir: "/tmp/claude-0/-home-user-stacks/524cead1-37aa-5636-92f6-5c014d39329a/scratchpad/proto-build",
    emptyOutDir: true,
    rollupOptions: { input: web + "proto/trip-desktop.html" },
  },
});
