import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The real production app with empty storage: no Clerk, no API, no fixtures. Anything leaving
// this origin is refused, so sign-in is unavailable throughout.
const isolate = async (context: BrowserContext) => {
  const api: string[] = [];
  await context.route(
    (url) => url.hostname !== "127.0.0.1",
    (route) => route.abort("internetdisconnected"),
  );
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1" && url.pathname.startsWith("/api/")) api.push(url.pathname);
  });
  return api;
};

const dialog = (page: Page) => page.getByRole("dialog");
const dock = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).last();

async function start(page: Page, amount: string) {
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await dialog(page).getByLabel("Buy-in").fill(amount);
  await dialog(page).getByLabel("Buy-in").press("Enter");
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Session" })).toBeVisible();
}

async function rebuy(page: Page, amount: string) {
  await dock(page, "Rebuy").click();
  await dialog(page).getByRole("textbox", { name: "Amount" }).fill(amount);
  await dialog(page).getByRole("button", { name: "Record rebuy" }).click();
  await expect(dialog(page)).toBeHidden();
}

async function cashOut(page: Page, amount: string, after: "Keep playing" | "Finish playing") {
  await dock(page, "Cash out").click();
  await dialog(page).getByRole("textbox", { name: "Amount" }).fill(amount);
  await dialog(page).getByText(after, { exact: true }).click();
  await dialog(page)
    .getByRole("button", {
      name: after === "Keep playing" ? "Record cash-out" : "Cash out and finish",
    })
    .click();
  await expect(dialog(page)).toBeHidden();
}

async function expectLive(page: Page, totalIn: string, totalOut: string) {
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByText("Final result pending until you finish playing.")).toBeVisible();
  const totals = page.getByRole("definition");
  await expect(totals.nth(0)).toHaveText(totalIn);
  await expect(totals.nth(1)).toHaveText(totalOut);
}

async function expectFinished(page: Page, result: string, amounts: string) {
  await expect(page.getByText("Finished", { exact: true })).toBeVisible();
  await expect(page.getByText("Final result", { exact: true })).toBeVisible();
  await expect(page.getByText(result, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(amounts, { exact: true })).toBeVisible();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
}

test("records the milestone session through reloads without an account", async ({
  page,
  context,
}) => {
  const api = await isolate(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your play" })).toBeVisible();
  await expect(page.getByText("No sessions yet")).toBeVisible();
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();

  await start(page, "200");
  await expectLive(page, "$200", "$0");
  await rebuy(page, "100");
  await expect(
    page.getByRole("status").filter({ hasText: "Rebuy of $100 recorded." }),
  ).toBeVisible();
  await cashOut(page, "100", "Keep playing");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Cash-out of $100 recorded. You're still playing." }),
  ).toBeVisible();
  await expectLive(page, "$300", "$100");

  await page.reload();
  await expectLive(page, "$300", "$100");
  await page.getByRole("link", { name: "Your play" }).click();
  await expect(page.getByText("Playing now")).toBeVisible();
  await expect(page.getByText(/In \$300 · Out \$100 · Result pending/)).toBeVisible();
  await expect(page.getByText("Finished results")).toBeHidden();
  await page.getByRole("link", { name: /Session/ }).click();

  await dock(page, "Cash out").click();
  await expect(dialog(page).getByText("Earlier ones total $100.")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Close" }).click();
  await cashOut(page, "250", "Finish playing");
  await expectFinished(page, "+$50", "In $300 · Out $350");
  await page.reload();
  await expectFinished(page, "+$50", "In $300 · Out $350");
  await expect(dock(page, "Start another session")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rebuy" })).toHaveCount(0);

  await page.getByRole("link", { name: "Your play" }).click();
  await expect(page.getByText("Playing now")).toBeHidden();
  await expect(page.getByText("Finished results")).toBeVisible();
  await expect(page.getByText("1 finished session.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Session.*\+\$50/ })).toBeVisible();
  expect(api).toEqual([]);
});

test("corrects, voids and fixes an accidental finish, and the audit survives reload", async ({
  page,
  context,
}) => {
  const api = await isolate(context);
  await page.goto("/");
  await start(page, "200");
  await cashOut(page, "0", "Finish playing");
  await expectFinished(page, "-$200", "In $200 · Out $0");

  await dock(page, "Fix accidental finish").click();
  await dialog(page).getByRole("button", { name: "Reopen session" }).click();
  await expect(dialog(page).getByText("Say what happened.")).toBeVisible();
  await expect(
    dialog(page).getByText("Your $0 final cash-out will be voided, since you never cashed out."),
  ).toBeVisible();
  await dialog(page).getByLabel("What happened").fill("Tapped finish by mistake");
  await dialog(page).getByRole("button", { name: "Reopen session" }).click();
  await expect(dialog(page)).toBeHidden();
  await expectLive(page, "$200", "$0");
  await expect(page.getByText("Reopened: Tapped finish by mistake")).toBeVisible();
  await expect(page.getByText("Finished playing")).toBeVisible();

  await page.getByRole("button", { name: /^Buy-in, \$200/ }).click();
  await dialog(page).getByRole("button", { name: "Correct amount" }).click();
  await expect(dialog(page).getByLabel("Correct amount")).toHaveValue("200");
  await dialog(page).getByLabel("Correct amount").fill("150");
  await dialog(page).getByLabel("What was wrong").fill("Miscounted");
  await dialog(page).getByRole("button", { name: "Save correction" }).click();
  await expect(dialog(page)).toBeHidden();
  await expectLive(page, "$150", "$0");

  await page.reload();
  await expectLive(page, "$150", "$0");
  await page.getByRole("button", { name: /^Buy-in, \$200.*voided/ }).click();
  await expect(dialog(page).getByText("Miscounted")).toBeVisible();
  await dialog(page).getByRole("button", { name: "View correction" }).click();
  await expect(dialog(page).getByText("$150")).toBeVisible();
  await dialog(page).getByRole("button", { name: "View original" }).click();
  await expect(dialog(page).getByText("$200")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Final cash-out, \$0.*voided/ })).toBeVisible();

  await rebuy(page, "100");
  await cashOut(page, "0", "Finish playing");
  await expectFinished(page, "-$250", "In $250 · Out $0");

  await page.getByRole("button", { name: /^Buy-in, \$100/ }).click();
  await dialog(page).getByRole("button", { name: "Correct amount" }).click();
  await dialog(page).getByLabel("Correct amount").fill("50");
  await dialog(page).getByLabel("What was wrong").fill("Was a $50 rebuy");
  await expect(dialog(page).getByText("The session stays finished")).toBeVisible();
  await dialog(page).getByRole("button", { name: "Save correction" }).click();
  await expectFinished(page, "-$200", "In $200 · Out $0");
  await page.reload();
  await expectFinished(page, "-$200", "In $200 · Out $0");
  expect(api).toEqual([]);
});

test("adds a completed past session from totals and times", async ({ page, context }) => {
  const api = await isolate(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Add past session" }).click();
  await dialog(page).getByLabel("Total in").fill("500");
  await dialog(page).getByLabel("Total out").fill("820.50");
  await dialog(page).getByLabel("Date").fill("2026-11-01");
  await dialog(page).getByLabel("Started").fill("21:30");
  await dialog(page).getByLabel("Finished").fill("01:15");
  await dialog(page).getByLabel("Game").selectOption("Blackjack");
  await dialog(page).getByRole("button", { name: "Add session" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Blackjack" })).toBeVisible();
  await expectFinished(page, "+$320.50", "In $500 · Out $820.50");
  await expect(page.getByText(/9:30\sPM to 1:15\sAM/)).toBeVisible();
  await page.getByRole("link", { name: "Your play" }).click();
  await expect(page.getByRole("link", { name: /Blackjack.*\+\$320\.50/ })).toBeVisible();
  expect(api).toEqual([]);
});

test("explains invalid amounts beside the field and keeps what was typed", async ({
  page,
  context,
}) => {
  await isolate(context);
  await page.goto("/");
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  const field = dialog(page).getByLabel("Buy-in");
  const submit = dialog(page).getByRole("button", { name: "Start session" });
  for (const [text, error] of [
    ["", "Enter an amount."],
    ["-5", "Enter an amount without a minus sign."],
    ["0", "Enter an amount greater than zero."],
    ["12.345", "Use whole cents, like 12.50."],
    ["99999999999999999999", "That amount is too large."],
  ] as const) {
    await field.fill(text);
    await submit.click();
    await expect(dialog(page).getByText(error)).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveValue(text);
  }
  await field.fill("20");
  await expect(field).not.toHaveAttribute("aria-invalid");
  expect(await field.evaluate((input) => getComputedStyle(input).fontSize)).not.toBe("14px");
  expect(
    Number.parseFloat(await field.evaluate((input) => getComputedStyle(input).fontSize)),
  ).toBeGreaterThanOrEqual(16);
});

test("keeps the draft after a failed save and retries the same command", async ({
  page,
  context,
}) => {
  await isolate(context);
  await context.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if ((window as { failWrites?: boolean }).failWrites)
        throw new DOMException("Full", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.goto("/");
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  await page.evaluate(() => ((window as { failWrites?: boolean }).failWrites = true));
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await dialog(page).getByLabel("Buy-in").fill("200");
  await dialog(page).getByRole("button", { name: "Start session" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText(
    "This device is out of storage space. Couldn't save. What you entered is still here.",
  );
  await expect(dialog(page).getByLabel("Buy-in")).toHaveValue("200");
  await expect(page.getByText("Last change not saved")).toBeVisible();

  await page.evaluate(() => ((window as { failWrites?: boolean }).failWrites = false));
  await dialog(page).getByRole("button", { name: "Start session" }).click();
  await expect(page).toHaveURL(/\/play\//);
  await expect(page.getByText("Saved on this device", { exact: true })).toBeVisible();
  const operations = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("color-up-recording");
        request.addEventListener("error", () => reject(request.error));
        request.addEventListener("success", () => {
          const read = request.result
            .transaction("documents")
            .objectStore("documents")
            .get("device");
          read.addEventListener("success", () =>
            resolve(JSON.parse(read.result.payload).receipts.length),
          );
        });
      }),
  );
  expect(operations).toBe(1);
});

test("dialogs take and return focus from the keyboard", async ({ page, context, isMobile }) => {
  // A touch screen deliberately doesn't open the keyboard on its own.
  test.skip(isMobile);
  await isolate(context);
  await page.goto("/");
  const startButton = page.getByRole("button", { name: "Start session", exact: true });
  await startButton.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByLabel("Buy-in")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(startButton).toBeFocused();

  await startButton.click();
  await page.keyboard.type("200");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/play\//);
  await expect(page.locator("body")).not.toBeFocused();

  const row = page.getByRole("button", { name: /^Buy-in, \$200/ });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();

  await dock(page, "Cash out").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("0");
  await dialog(page).getByText("Finish playing", { exact: true }).click();
  await dialog(page).getByRole("textbox", { name: "Amount" }).press("Enter");
  await expect(dialog(page)).toBeHidden();
  // The Cash out button is gone once play finishes; focus lands on what was saved instead.
  await expect(page.getByRole("button", { name: "View entry" })).toBeFocused();
});

test("reopens Home and a live session with all networking off, then finishes it", async ({
  page,
  context,
}) => {
  const api = await isolate(context);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith("color-up-shell-"))!;
    return (await (await caches.open(name)).keys()).map((entry) => new URL(entry.url).pathname);
  });
  expect(cached.some((path) => /\/_visitId-.*\.js$/.test(path))).toBe(true);
  expect(cached.some((path) => path.endsWith(".woff2"))).toBe(true);
  await start(page, "200");
  await rebuy(page, "100");
  await cashOut(page, "100", "Keep playing");
  const visit = new URL(page.url()).pathname;
  await page.close();

  await context.setOffline(true);
  const home = await context.newPage();
  const navigation = await home.goto("/");
  expect(navigation?.fromServiceWorker()).toBe(true);
  await expect(home.getByText("Playing now")).toBeVisible();
  await expect(home.getByText(/In \$300 · Out \$100 · Result pending/)).toBeVisible();
  await expect(home.getByText("Saved on this device", { exact: true })).toBeVisible();
  await home.close();

  const live = await context.newPage();
  const deepLink = await live.goto(visit);
  expect(deepLink?.fromServiceWorker()).toBe(true);
  await expectLive(live, "$300", "$100");
  await cashOut(live, "250", "Finish playing");
  await expectFinished(live, "+$50", "In $300 · Out $350");
  await live.reload();
  await expectFinished(live, "+$50", "In $300 · Out $350");
  await live.getByRole("link", { name: "Your play" }).click();
  await expect(live.getByRole("link", { name: /Session.*\+\$50/ })).toBeVisible();
  expect(api).toEqual([]);
});
