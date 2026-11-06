import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  timeout: 15_000,
  outputDir: "/tmp/color-up-recording-storage-results",
  use: { baseURL: "http://127.0.0.1:5299", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec vp dev --config recording-storage/vite.config.ts",
    url: "http://127.0.0.1:5299",
    reuseExistingServer: false,
  },
});
