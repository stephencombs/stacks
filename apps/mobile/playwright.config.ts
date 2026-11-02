import { defineConfig, devices } from "@playwright/test";
import * as NodeFS from "node:fs";

// Clerk keys come from the same gitignored files the app and API read.
for (const file of [".env.local", "../api/.dev.vars"]) {
  if (NodeFS.existsSync(file)) process.loadEnvFile(file);
}
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Runs the app's web build at phone size; native builds need a simulator or device. */
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global.setup.ts",
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  use: {
    ...devices["iPhone 15"],
    browserName: "chromium",
    baseURL: "http://localhost:8081",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @stacks/api dev",
      url: "http://localhost:8787/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "serve --single --listen 8081 dist-web",
      url: "http://localhost:8081",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
