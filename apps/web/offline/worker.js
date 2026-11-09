const shell = JSON.parse("__COLOR_UP_SHELL_MANIFEST__");
const ownedCachePrefix = "color-up-shell-v1-";
const assets = new Set(shell.assets);
const reserved =
  /^\/(?:api|auth|__clerk|clerk|sign-in|sign-up|sign-out|login|logout|sso-callback|oauth|callback|\.well-known|cdn-cgi)(?:\/|$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shell.cacheName);
      try {
        for (const path of shell.assets) {
          // Workers static assets redirect /index.html to /, so the shell is fetched from /.
          const source = path === "/index.html" ? "/" : path;
          const response = await fetch(
            new Request(new URL(source, self.location.origin), {
              cache: "reload",
              credentials: "omit",
              redirect: "error",
              integrity: shell.integrity[path],
            }),
          );
          const mime = response.headers.get("content-type") ?? "";
          const validType = path.endsWith(".html")
            ? mime.includes("text/html")
            : path.endsWith(".js")
              ? /(?:javascript|ecmascript)/.test(mime)
              : path.endsWith(".css")
                ? mime.includes("text/css")
                : !mime.includes("text/html");
          if (!response.ok || response.redirected || !validType) {
            throw new Error(`Offline app shell could not cache ${path}`);
          }
          await cache.put(path, response);
        }
      } catch (error) {
        await caches.delete(shell.cacheName);
        throw error;
      }
    })(),
  );
  // Let existing tabs finish with their version; a page switches only when its person agrees.
});

self.addEventListener("message", (event) => {
  if (event.origin === self.location.origin && event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(ownedCachePrefix) && name !== shell.cacheName)
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.search ||
    request.headers.has("authorization") ||
    request.headers.has("range") ||
    reserved.test(url.pathname)
  ) {
    return;
  }
  const asset = assets.has(url.pathname);
  const navigation = request.mode === "navigate" && !/\.[^/]+$/.test(url.pathname);
  if (!asset && !navigation) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(shell.cacheName);
      const response = await cache.match(asset ? url.pathname : "/index.html");
      return response ?? fetch(request);
    })(),
  );
});
