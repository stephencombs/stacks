import { defineConfig, devices } from "@playwright/test";
import * as NodePath from "node:path";

const PORT = 8093;

/**
 * Private recording in the app's web build, signed out: built without a Clerk key and served on
 * its own, with no API. The config builds and serves it, and stops the server when done.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  use: {
    ...devices["iPhone 15"],
    browserName: "chromium",
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `expo export --platform web --output-dir solo/dist && serve --single --no-clipboard --listen tcp://127.0.0.1:${PORT} solo/dist`,
    cwd: NodePath.resolve(__dirname, ".."),
    // No Clerk key, from the shell or a .env file: sign-in is unavailable throughout.
    env: { EXPO_NO_DOTENV: "1", EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "", CI: "1" },
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 600_000,
  },
});
