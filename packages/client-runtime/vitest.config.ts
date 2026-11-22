import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

const startup = ["src/trip-startup.test.ts"];

export default defineConfig({
  test: {
    allowOnly: !process.env.CI,
    exclude: ["**/node_modules/**", "**/dist/**"],
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          isolate: false,
          include: ["src/**/*.test.ts"],
          exclude: startup,
        },
      },
      {
        test: {
          name: "startup",
          environment: "node",
          isolate: true,
          include: startup,
        },
      },
    ],
  },
});
