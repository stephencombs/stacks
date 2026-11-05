import { afterEach, expect, it, vi } from "vite-plus/test";

const posthog = vi.hoisted(() => ({ captureStartup: vi.fn(), captureCaughtError: vi.fn() }));
vi.mock("./telemetry", () => posthog);
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { appVariant: "preview" } } },
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("records JS entry before other milestones and only records each milestone once", async () => {
  vi.stubGlobal("__DEV__", true);
  const { markStartup } = await import("./diagnostics");
  markStartup("root_committed");
  markStartup("root_committed");
  expect(posthog.captureStartup).toHaveBeenCalledWith("js_entry", expect.any(Number), "preview");
  expect(posthog.captureStartup).toHaveBeenCalledWith(
    "root_committed",
    expect.any(Number),
    "preview",
  );
  expect(posthog.captureStartup).toHaveBeenCalledTimes(2);
});

it("reports caught failures to PostHog with the last startup stage", async () => {
  vi.stubGlobal("__DEV__", true);
  const { markStartup, reportStartupError } = await import("./diagnostics");
  markStartup("navigation_ready");
  const error = new TypeError("Private message");
  reportStartupError(error);
  expect(posthog.captureCaughtError).toHaveBeenCalledOnce();
  expect(posthog.captureCaughtError).toHaveBeenCalledWith(error, "navigation_ready", "preview");
});

it("reports production Hermes promise rejections without depending on sign-in", async () => {
  vi.stubGlobal("__DEV__", false);
  const enablePromiseRejectionTracker = vi.fn();
  vi.stubGlobal("HermesInternal", { enablePromiseRejectionTracker });
  await import("./diagnostics");
  const [{ onUnhandled }] = enablePromiseRejectionTracker.mock.calls[0]!;
  const error = new Error("Native async startup failed");
  onUnhandled(1, error);
  expect(posthog.captureCaughtError).toHaveBeenCalledWith(error, "js_entry", "preview");
});

it("leaves development rejection tracking to React Native", async () => {
  vi.stubGlobal("__DEV__", true);
  const enablePromiseRejectionTracker = vi.fn();
  vi.stubGlobal("HermesInternal", { enablePromiseRejectionTracker });
  await import("./diagnostics");
  expect(enablePromiseRejectionTracker).not.toHaveBeenCalled();
});
