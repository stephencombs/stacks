import type PostHog from "posthog-react-native";
import { afterEach, expect, it, vi } from "vite-plus/test";

type Options = NonNullable<ConstructorParameters<typeof PostHog>[1]>;
const sdk = vi.hoisted(() => ({
  configurations: new Array<Options>(),
  capture: vi.fn(),
  captureException: vi.fn(),
  isFeatureEnabled: vi.fn(() => false),
}));

vi.mock("posthog-react-native", () => ({
  default: class {
    constructor(_token: string, options: Options) {
      sdk.configurations.push(options);
    }
    capture = sdk.capture;
    captureException = sdk.captureException;
    isFeatureEnabled = sdk.isFeatureEnabled;
  },
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sdk.configurations.length = 0;
  vi.unstubAllEnvs();
});

it("sends startup and caught errors without waiting for a feature flag", async () => {
  vi.stubEnv("EXPO_PUBLIC_POSTHOG_TOKEN", "project-token");
  vi.stubEnv("EXPO_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  const { captureStartup, captureCaughtError } = await import("./telemetry");
  captureStartup("navigation_ready", 1200, "production");
  expect(sdk.capture).toHaveBeenCalledWith("app_startup", {
    startup_stage: "navigation_ready",
    startup_elapsed_ms: 1200,
    startup_environment: "production",
  });
  expect(sdk.isFeatureEnabled).not.toHaveBeenCalled();
  const error = new Error("Private note");
  captureCaughtError(error, "navigation_ready", "production");
  expect(sdk.captureException).toHaveBeenCalledWith(error, {
    startup_stage: "navigation_ready",
    startup_environment: "production",
  });
  expect(sdk.configurations[0]).toMatchObject({
    flushAt: 1,
    enableSessionReplay: false,
    captureAppLifecycleEvents: false,
    personProfiles: "never",
    errorTracking: { autocapture: { unhandledRejections: false, console: false } },
  });
});

it("remains usable without PostHog configuration", async () => {
  vi.stubEnv("EXPO_PUBLIC_POSTHOG_TOKEN", "");
  vi.stubEnv("EXPO_PUBLIC_POSTHOG_HOST", "");
  const { captureStartup, captureCaughtError } = await import("./telemetry");
  expect(() => captureStartup("js_entry", 0, "development")).not.toThrow();
  expect(() => captureCaughtError(new Error("Failed"), "js_entry", "development")).not.toThrow();
  expect(sdk.configurations).toHaveLength(0);
  expect(sdk.capture).not.toHaveBeenCalled();
  expect(sdk.captureException).not.toHaveBeenCalled();
});
