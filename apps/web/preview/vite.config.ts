// Preview only: the real app with Clerk stubbed and /api answered from fixtures.
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import * as NodeURL from "node:url";
import { defineConfig } from "vite-plus";

const web = NodeURL.fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
  root: web,
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@clerk/react", replacement: web + "preview/clerk-stub.tsx" },
      { find: "~", replacement: web + "src" },
    ],
  },
  // The stub stands in for Clerk, so the app treats sign-in as configured.
  define: { "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify("pk_preview") },
  // PREVIEW_PORT lets two worktrees preview at once.
  server: { port: Number(process.env.PREVIEW_PORT ?? 5199), strictPort: true },
});
