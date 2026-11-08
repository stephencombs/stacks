import { runInNewContext } from "node:vm";
import { resolveConfig } from "vite-plus";
import { expect, it, vi } from "vite-plus/test";
import { offlineAppShell, renderAppShell } from "./build";

const entries = [
  { fileName: "index.html", source: '<div id="root"></div>' },
  { fileName: "assets/main-hash.js", source: "main" },
  { fileName: "assets/new-route-hash.js", source: "route" },
  { fileName: "assets/style-hash.css", source: "style" },
  { fileName: "assets/font-hash.woff2", source: "font" },
  { fileName: "assets/main-hash.js.map", source: "source map" },
  { fileName: "table-art/huge.webp", source: "public art" },
  { fileName: "assets/rail-7-1-hash.webp", source: "bundled table art" },
];

type WorkerEvent = {
  request?: Pick<Request, "url" | "method" | "headers" | "mode">;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response>) => void;
};

function worker(source = renderAppShell(entries)) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stored = new Map<string, Map<string, Response>>();
  const fetch = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    const mime = path.endsWith(".html")
      ? "text/html"
      : path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "font/woff2";
    return new Response(path, { headers: { "content-type": mime } });
  });
  const caches = {
    keys: async () => [...stored.keys()],
    delete: vi.fn(async (key: string) => stored.delete(key)),
    open: async (key: string) => {
      let cache = stored.get(key);
      if (!cache) {
        cache = new Map();
        stored.set(key, cache);
      }
      return {
        put: async (path: string, response: Response) => cache.set(path, response),
        match: async (path: string) => cache.get(path)?.clone(),
      };
    },
  };
  const skipWaiting = vi.fn();
  const claim = vi.fn();
  const manifest = runInNewContext(`${source}\n; shell`, {
    self: {
      location: { origin: "https://color-up.test" },
      addEventListener: (type: string, handler: (event: WorkerEvent) => void) => {
        handlers.set(type, handler);
      },
      skipWaiting,
      clients: { claim },
    },
    caches,
    fetch,
    URL,
    Request,
  }) as { cacheName: string; assets: string[] };
  function lifecycle(type: "install" | "activate") {
    let result: Promise<unknown> | undefined;
    handlers.get(type)!({ waitUntil: (promise) => (result = promise) });
    return result!;
  }
  function request(path: string, options: RequestInit = {}) {
    let result: Promise<Response> | undefined;
    const url = new URL(path, "https://color-up.test");
    handlers.get("fetch")!({
      request: {
        url: url.href,
        method: options.method ?? "GET",
        mode: options.mode ?? "same-origin",
        headers: new Headers(options.headers),
      },
      respondWith: (promise) => (result = promise),
    });
    return result;
  }
  return { manifest, stored, caches, fetch, lifecycle, request, skipWaiting, claim };
}

it("versions only the complete emitted shell, including new lazy routes, deterministically", () => {
  const first = worker();
  expect(first.manifest.assets).toEqual([
    "/assets/font-hash.woff2",
    "/assets/main-hash.js",
    "/assets/new-route-hash.js",
    "/assets/style-hash.css",
    "/index.html",
  ]);
  expect(worker(renderAppShell(entries.toReversed())).manifest).toEqual(first.manifest);
  const changed = entries.map((entry) =>
    entry.fileName === "assets/new-route-hash.js" ? { ...entry, source: "updated" } : entry,
  );
  expect(worker(renderAppShell(changed)).manifest.cacheName).not.toBe(first.manifest.cacheName);
  expect(() => renderAppShell([])).toThrow("index.html");
});

it("installs anonymously, serves only admitted static requests, and never stores navigation URLs", async () => {
  const shell = worker();
  await shell.lifecycle("install");
  for (const [request] of shell.fetch.mock.calls) {
    expect(request.credentials).toBe("omit");
    expect(request.redirect).toBe("error");
    expect(request.cache).toBe("reload");
    expect(request.integrity).toMatch(/^sha256-/);
  }
  shell.fetch.mockClear();
  expect(await (await shell.request("/play/new-route", { mode: "navigate" }))?.text()).toBe(
    "/index.html",
  );
  expect(await (await shell.request("/assets/new-route-hash.js"))?.text()).toBe(
    "/assets/new-route-hash.js",
  );
  for (const path of [
    "/api",
    "/api/private",
    "/__clerk/v1/client",
    "/auth/callback",
    "/sign-in",
    "/oauth/callback",
    "/.well-known/configuration",
    "/assets/missing.js",
    "/private.json",
    "/table-art/huge.webp",
    "/play/visit?token=secret",
    "/index.html?token=secret",
    "https://other.test/assets/main-hash.js",
  ]) {
    expect(shell.request(path, { mode: "navigate" }), path).toBeUndefined();
  }
  for (const options of [
    { method: "POST" },
    { headers: { authorization: "Bearer secret" } },
    { headers: { range: "bytes=0-10" } },
  ]) {
    expect(shell.request("/index.html", options)).toBeUndefined();
  }
  expect(shell.request("/play/new-route")).toBeUndefined();
  expect(shell.fetch).not.toHaveBeenCalled();
  expect([...shell.stored.get(shell.manifest.cacheName)!.keys()]).toEqual(shell.manifest.assets);
});

it.each(["network", "missing", "html", "redirect"])(
  "rejects and removes an incomplete installation after a %s failure, preserving other caches",
  async (failure) => {
    const shell = worker();
    shell.stored.set("color-up-shell-v1-old", new Map());
    shell.stored.set("another-app", new Map());
    shell.fetch.mockImplementationOnce(async () => {
      if (failure === "network") throw new TypeError("offline");
      const response = new Response("bad", {
        status: failure === "missing" ? 404 : 200,
        headers: { "content-type": "text/html" },
      });
      if (failure === "redirect") Object.defineProperty(response, "redirected", { value: true });
      return response;
    });
    await expect(shell.lifecycle("install")).rejects.toThrow();
    expect([...shell.stored.keys()]).toEqual(["color-up-shell-v1-old", "another-app"]);
  },
);

it("activates without taking over tabs and removes only previous owned cache versions", async () => {
  const shell = worker();
  await shell.lifecycle("install");
  shell.stored.set("color-up-shell-v1-old", new Map());
  shell.stored.set("another-app", new Map());
  shell.stored.set("color-up-other-data", new Map());
  await shell.lifecycle("activate");
  expect([...shell.stored.keys()]).toEqual([
    shell.manifest.cacheName,
    "another-app",
    "color-up-other-data",
  ]);
  expect(shell.skipWaiting).not.toHaveBeenCalled();
  expect(shell.claim).not.toHaveBeenCalled();
});

it("enables registration only in the production build plugin", async () => {
  const production = await resolveConfig(
    { configFile: false, plugins: [offlineAppShell()] },
    "build",
    "production",
  );
  expect(production.define?.["import.meta.env.COLOR_UP_OFFLINE_SHELL"]).toBe(
    JSON.stringify("enabled"),
  );
  const development = await resolveConfig(
    { configFile: false, plugins: [offlineAppShell()] },
    "serve",
    "development",
  );
  expect(development.define?.["import.meta.env.COLOR_UP_OFFLINE_SHELL"]).toBeUndefined();
  const fixture = await resolveConfig(
    { configFile: false, plugins: [offlineAppShell()] },
    "build",
    "fixture",
  );
  expect(fixture.define?.["import.meta.env.COLOR_UP_OFFLINE_SHELL"]).toBeUndefined();
});
