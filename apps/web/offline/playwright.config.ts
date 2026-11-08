import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5298",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "phone", use: devices["Pixel 7"], testMatch: /solo\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm exec vp preview --host 127.0.0.1 --port 5298 --strictPort",
    url: "http://127.0.0.1:5298",
    reuseExistingServer: false,
  },
});
