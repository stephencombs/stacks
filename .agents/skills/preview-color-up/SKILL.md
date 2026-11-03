---
name: preview-color-up
description: See Color Up's web app running, signed in and full of data, without Clerk keys or a database, and take screenshots of it. Use to check a UI change, capture before/after images for a PR, or measure layout shift and loading states. Covers the preview server, its routes and fixtures, and screenshots.
---

# Preview Color Up

`pnpm --filter @stacks/web dev:preview` serves the real web app from `apps/web` with two things
swapped: `@clerk/react` is a stub that is always signed in as Maya, and every `/api` request is
answered from `apps/web/preview/fixtures.ts` after a short delay. Everything else (routes, data
layer, components, styles) is the code you're changing.

Use it for UI work. It can't test writes, permissions or the API; those need the real stack
(`docker compose up -d`, migrate, seed, `pnpm dev`) and the Playwright e2e test.

## Start and stop

```sh
cd apps/web
nohup pnpm dev:preview > /tmp/preview.log 2>&1 < /dev/null &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:5199/preview/index.html && break; sleep 1; done
lsof -ti tcp:5199 > /tmp/preview.pid   # the Vite process, not pnpm
```

Stop it with `kill $(cat /tmp/preview.pid)`. Never kill by name. Set `PREVIEW_PORT` to run a second
preview from another worktree.

## Open a route

Load `http://localhost:5199/preview/index.html?path=<route>`. The page swaps its address for
`path` before the app boots. `&delay=<ms>` sets the fake network delay (default 300); use 0 for
screenshots and 600 or more to watch loading states.

The fixtures describe one group, "Thursday crew", with five players (Jonah is a guest), a running
trip with six closed sessions and a live one you're sitting in, and an ended trip:

| What                 | Id                                     |
| -------------------- | -------------------------------------- |
| Group                | `0192e7a0-0000-7000-8000-000000000001` |
| Trip, running        | `0192e7a0-0000-7000-8000-000000000002` |
| Trip, ended          | `0192e7a0-0000-7000-8000-000000000003` |
| Live session (yours) | `0192e7a0-0000-7000-8000-000000000050` |

A request with no fixture answers 404, which the app shows as its not-found state. When a new
screen needs data, add it to `routes` in `fixtures.ts`. Every fixture is decoded and re-encoded
through its contract schema when the preview loads, so a field that drifted from the contract fails
loudly in the console instead of rendering wrong.

## Screenshots

Playwright and Chromium are installed globally; run scripts with `NODE_PATH=$(npm root -g)`. Keep
scripts and images outside the repo.

```js
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => console.error(e.message));
  const path = "/trips/0192e7a0-0000-7000-8000-000000000002";
  await page.goto(`http://localhost:5199/preview/index.html?delay=0&path=${encodeURIComponent(path)}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "/tmp/trip-390.png", fullPage: true });
  await browser.close();
})();
```

- Capture phone (390) and desktop (1440) widths, and both themes when color is involved:
  `localStorage.setItem("stacks-theme", "light")` in an init
  script.
- Use `deviceScaleFactor: 2` for images a person will see, and 1 for checks only you read.
- For before/after, check out the base commit in a second worktree and preview it on another
  `PREVIEW_PORT`.
- Measure layout shift with a `PerformanceObserver` for `layout-shift` added in
  `page.addInitScript`, and a `delay` long enough to see the skeleton.

## Mobile

The preview covers web only. Mobile has no equivalent here: check mobile changes with
`pnpm --filter @stacks/mobile typecheck` and tests, and on a device or simulator through the dev
client (`pnpm dev:mobile`). Say plainly when a mobile change wasn't seen running.
