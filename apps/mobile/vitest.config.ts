import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

const dom = ["**/*.test.tsx", "*.test.tsx", "src/lib/liveSessionAdapter.test.ts"];

export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    exclude: ["**/node_modules/**", "**/dist/**"],
    projects: [
      {
        test: {
          name: "dom",
          environment: "happy-dom",
          include: dom,
        },
      },
      {
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["src/lib/liveSessionAdapter.test.ts"],
        },
      },
    ],
  },
});
