import { defineConfig, devices } from "@playwright/test";
import * as NodeFS from "node:fs";

// Clerk keys come from the same gitignored files the dev servers read.
for (const file of [".env.local", "../api/.dev.vars"]) {
  if (NodeFS.existsSync(file)) process.loadEnvFile(file);
}
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.VITE_CLERK_PUBLISHABLE_KEY;

// `E2E_BASE_URL` runs the suite against a deployed site instead of the dev servers.
const deployed = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global.setup.ts",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  use: { baseURL: deployed ?? "http://localhost:5173", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: deployed
    ? []
    : [
        {
          command: "pnpm --filter @stacks/api dev",
          url: "http://localhost:8787/api/health",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: "pnpm --filter @stacks/web dev",
          url: "http://localhost:5173",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
});
