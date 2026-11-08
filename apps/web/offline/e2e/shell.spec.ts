import { expect, test } from "@playwright/test";

// No Clerk setup, auth interception, local ledger, or fixture application.
test("the production shell installs and reopens a deep link with the network disabled", async ({
  page,
  context,
  request,
}) => {
  const worker = await request.get("/sw.js");
  expect(worker.headers()["content-type"]).toContain("javascript");

  const installationFailure = page
    .waitForEvent("console", {
      predicate: (message) =>
        message.text().includes("offline app shell. Reopening offline may fail."),
    })
    .then((message) => {
      throw new Error(message.text());
    });
  await page.goto("/");
  await Promise.race([page.evaluate(() => navigator.serviceWorker.ready), installationFailure]);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const name = names.find((key) => key.startsWith("color-up-shell-"))!;
    const cache = await caches.open(name);
    return (await cache.keys()).map((entry) => new URL(entry.url).pathname);
  });
  expect(cached).toContain("/index.html");
  expect(cached.some((url) => url.endsWith(".woff2"))).toBe(true);
  expect(cached.some((url) => /\.(?:webp|png|jpe?g)$/.test(url))).toBe(false);
  expect(cached.some((url) => /\/_sessionId.*\.js$/.test(url))).toBe(true);
  expect(cached.every((url) => url === "/index.html" || url.startsWith("/assets/"))).toBe(true);

  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  const responses: { url: string; fromWorker: boolean; ok: boolean }[] = [];
  reopened.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/assets/")) {
      responses.push({
        url: response.url(),
        fromWorker: response.fromServiceWorker(),
        ok: response.ok(),
      });
    }
  });
  const navigation = await reopened.goto("/play/offline-shell-check");
  expect(navigation?.fromServiceWorker()).toBe(true);
  expect(await navigation?.text()).toContain('<div id="root"></div>');
  await expect(reopened).toHaveTitle("Color Up");
  await reopened.waitForLoadState("load");
  expect(responses.some((response) => response.url.endsWith(".js"))).toBe(true);
  expect(responses.every((response) => response.fromWorker && response.ok)).toBe(true);

  // Fetch every emitted lazy route/font too; an auth-gated UI alone cannot prove this.
  const available = await reopened.evaluate(async (paths) => {
    return Promise.all(paths.map(async (path) => (await fetch(path)).ok));
  }, cached);
  expect(available.every(Boolean)).toBe(true);
  const route = cached.find((path) => /\/_sessionId.*\.js$/.test(path))!;
  expect(
    await reopened.evaluate(async (path) => Object.keys(await import(path)).length, route),
  ).toBeGreaterThan(0);
  const failures = await reopened.evaluate(async () => {
    return Promise.all(
      [
        ["/api/private", {}],
        ["/auth/callback?token=secret", {}],
        ["/index.html?token=secret", {}],
        ["https://example.com/private", {}],
        ["/index.html", { method: "POST" }],
        ["/index.html", { headers: { Authorization: "Bearer secret" } }],
      ].map(async ([url, options]) => {
        try {
          await fetch(url as string, options as RequestInit);
          return false;
        } catch {
          return true;
        }
      }),
    );
  });
  expect(failures.every(Boolean)).toBe(true);
  const keysAfter = await reopened.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith("color-up-shell-"))!);
    return (await cache.keys()).map((entry) => new URL(entry.url).pathname);
  });
  expect(keysAfter).toEqual(cached);
});

test("a first-ever offline visit has no shell available", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage();
    await expect(page.goto(`${baseURL}/play/never-installed`)).rejects.toThrow();
  } finally {
    await context.close();
  }
});
