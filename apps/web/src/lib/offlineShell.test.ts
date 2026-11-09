// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vite-plus/test";

function serviceWorker({ controlled = true, waiting = false } = {}) {
  const installing = Object.assign(new EventTarget(), { state: "installing" });
  const waitingWorker = { postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), {
    installing: installing as EventTarget | null,
    waiting: waiting ? waitingWorker : null,
    update: vi.fn(async () => {}),
  });
  const register = vi.fn(async () => registration);
  const container = Object.assign(new EventTarget(), {
    register,
    controller: controlled ? {} : null,
  });
  const reload = vi.fn();
  vi.stubGlobal("navigator", { userAgent: "test", serviceWorker: container });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("location", { reload });
  return { container, installing, register, registration, reload, waitingWorker };
}

async function production() {
  vi.stubEnv("PROD", true);
  vi.stubEnv("COLOR_UP_OFFLINE_SHELL", "enabled");
  const shell = await import("./offlineShell");
  // Let the awaited register() resolve and the module wire its listeners.
  await new Promise((resolve) => setTimeout(resolve));
  const seen: boolean[] = [];
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const Probe = () => {
    seen.push(shell.useShellUpdate());
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  return { ...shell, ready: () => seen.at(-1), act };
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

it("offers a version that installs while open, and switches only on confirmation", async () => {
  const sw = serviceWorker();
  const shell = await production();
  expect(shell.ready()).toBe(false);
  Object.assign(sw.registration, { waiting: sw.waitingWorker });
  await shell.act(async () => {
    Object.assign(sw.installing, { state: "installed" });
    sw.installing.dispatchEvent(new Event("statechange"));
  });
  expect(shell.ready()).toBe(true);
  expect(sw.waitingWorker.postMessage).not.toHaveBeenCalled();
  shell.applyShellUpdate();
  expect(sw.waitingWorker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(sw.reload).not.toHaveBeenCalled();
  sw.container.dispatchEvent(new Event("controllerchange"));
  sw.container.dispatchEvent(new Event("controllerchange"));
  expect(sw.reload).toHaveBeenCalledOnce();
});

it("offers a version already waiting when the page loads", async () => {
  const sw = serviceWorker({ waiting: true });
  sw.registration.installing = null;
  const shell = await production();
  expect(shell.ready()).toBe(true);
  expect(sw.reload).not.toHaveBeenCalled();
});

it("does not offer the first install, which the next load already uses", async () => {
  const sw = serviceWorker({ controlled: false });
  const shell = await production();
  Object.assign(sw.registration, { waiting: sw.waitingWorker });
  await shell.act(async () => {
    Object.assign(sw.installing, { state: "installed" });
    sw.installing.dispatchEvent(new Event("statechange"));
  });
  expect(shell.ready()).toBe(false);
});

it("never reloads on its own when another tab takes the update", async () => {
  const sw = serviceWorker();
  const shell = await production();
  await shell.act(async () => {
    sw.container.dispatchEvent(new Event("controllerchange"));
  });
  expect(sw.reload).not.toHaveBeenCalled();
  expect(shell.ready()).toBe(true);
  shell.applyShellUpdate();
  expect(sw.reload).toHaveBeenCalledOnce();
});

it("checks for an update when the page becomes visible again", async () => {
  const sw = serviceWorker();
  await production();
  const visibility = vi.spyOn(document, "visibilityState", "get");
  visibility.mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(sw.registration.update).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(sw.registration.update).toHaveBeenCalledOnce();
});
