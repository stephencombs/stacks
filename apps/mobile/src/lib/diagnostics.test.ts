import { afterEach, expect, it, vi } from "vite-plus/test";

const observe = vi.hoisted(() => ({ configure: vi.fn(), logEvent: vi.fn(), reportError: vi.fn() }));
const posthog = vi.hoisted(() => ({ captureStartup: vi.fn(), captureCaughtError: vi.fn() }));
vi.mock("./telemetry", () => posthog);
vi.mock("expo-observe", () => ({ Observe: observe }));
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
  expect(observe.configure).toHaveBeenCalledWith({ environment: "preview" });
  expect(observe.logEvent).toHaveBeenNthCalledWith(1, "startup.js_entry", expect.any(Object));
  markStartup("root_committed");
  markStartup("root_committed");
  expect(observe.logEvent).toHaveBeenCalledTimes(2);
  await vi.dynamicImportSettled();
  expect(posthog.captureStartup).toHaveBeenCalledWith("js_entry", expect.any(Number), "preview");
  expect(posthog.captureStartup).toHaveBeenCalledWith(
    "root_committed",
    expect.any(Number),
    "preview",
  );
  expect(posthog.captureStartup).toHaveBeenCalledTimes(2);
});

it("reports caught failures to both services with the last startup stage", async () => {
  vi.stubGlobal("__DEV__", true);
  const { markStartup, reportStartupError } = await import("./diagnostics");
  markStartup("navigation_ready");
  const error = new TypeError("Private message");
  reportStartupError(error);
  await vi.dynamicImportSettled();
  expect(observe.reportError).toHaveBeenCalledWith(error);
  expect(posthog.captureCaughtError).toHaveBeenCalledOnce();
  expect(posthog.captureCaughtError).toHaveBeenCalledWith(error, "navigation_ready", "preview");
});

it("keeps native reporting available when PostHog capture fails", async () => {
  vi.stubGlobal("__DEV__", true);
  const failure = new Error("PostHog unavailable");
  posthog.captureStartup.mockImplementationOnce(() => {
    throw failure;
  });
  const { markStartup } = await import("./diagnostics");
  await vi.dynamicImportSettled();
  expect(observe.reportError).toHaveBeenCalledWith(failure);
  expect(() => markStartup("root_committed")).not.toThrow();
  await vi.dynamicImportSettled();
  expect(observe.logEvent).toHaveBeenCalledWith("startup.root_committed", expect.any(Object));
});

it("reports production Hermes promise rejections without depending on sign-in", async () => {
  vi.stubGlobal("__DEV__", false);
  const enablePromiseRejectionTracker = vi.fn();
  vi.stubGlobal("HermesInternal", { enablePromiseRejectionTracker });
  await import("./diagnostics");
  const [{ onUnhandled }] = enablePromiseRejectionTracker.mock.calls[0]!;
  const error = new Error("Native async startup failed");
  onUnhandled(1, error);
  expect(observe.reportError).toHaveBeenCalledWith(error);
});

it("leaves development rejection tracking to React Native", async () => {
  vi.stubGlobal("__DEV__", true);
  const enablePromiseRejectionTracker = vi.fn();
  vi.stubGlobal("HermesInternal", { enablePromiseRejectionTracker });
  await import("./diagnostics");
  expect(enablePromiseRejectionTracker).not.toHaveBeenCalled();
});
