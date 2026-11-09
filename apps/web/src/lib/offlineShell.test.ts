// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";

function serviceWorker() {
  const installing = new EventTarget();
  Object.assign(installing, { state: "installing" });
  const registration = Object.assign(new EventTarget(), { installing });
  const register = vi.fn(async () => registration);
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  return { installing, register, registration };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each([
  [false, undefined],
  [true, undefined],
  [false, "enabled"],
])("does not register in dev or fixture/prototype builds (%s, %s)", async (production, flag) => {
  vi.stubEnv("PROD", production);
  vi.stubEnv("COLOR_UP_OFFLINE_SHELL", flag);
  const { register } = serviceWorker();
  await import("./offlineShell");
  expect(register).not.toHaveBeenCalled();
});

it("registers only the production shell and reports installation failure", async () => {
  vi.stubEnv("PROD", true);
  vi.stubEnv("COLOR_UP_OFFLINE_SHELL", "enabled");
  const { register, installing } = serviceWorker();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./offlineShell");
  expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  Object.assign(installing, { state: "redundant" });
  installing.dispatchEvent(new Event("statechange"));
  expect(error).toHaveBeenCalledWith(expect.stringContaining("could not install"));
});

it("reports registration failure without claiming offline readiness", async () => {
  vi.stubEnv("PROD", true);
  vi.stubEnv("COLOR_UP_OFFLINE_SHELL", "enabled");
  const { register } = serviceWorker();
  const failure = new Error("storage denied");
  register.mockRejectedValue(failure);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./offlineShell");
  expect(error).toHaveBeenCalledWith(expect.stringContaining("could not register"), failure);
});

it("does not report a successfully installed worker being superseded as a failure", async () => {
  vi.stubEnv("PROD", true);
  vi.stubEnv("COLOR_UP_OFFLINE_SHELL", "enabled");
  const { installing } = serviceWorker();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./offlineShell");
  Object.assign(installing, { state: "installed" });
  installing.dispatchEvent(new Event("statechange"));
  Object.assign(installing, { state: "redundant" });
  installing.dispatchEvent(new Event("statechange"));
  expect(error).not.toHaveBeenCalled();
});
