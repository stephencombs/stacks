import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

// The app's web build with empty storage and no Clerk key: no account, no API. Anything leaving
// this origin is refused. The web stack keeps earlier screens mounted but hidden, and a sheet
// leaves the screen under it in the page, so lookups only count visible elements.

/**
 * Takes away what Chromium has and Hermes on iOS doesn't, so code the phone can't run fails here
 * too. The app's own polyfills then put back what it relies on.
 */
const isolate = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    const remove = (owner: object, key: PropertyKey) => Reflect.deleteProperty(owner, key);
    remove(Intl.NumberFormat.prototype, "formatToParts");
    remove(Array.prototype, "toSorted");
    remove(Array, "fromAsync");
    remove(globalThis, "structuredClone");
    remove(globalThis, "Iterator");
  });
  const api: string[] = [];
  await context.route(
    (url) => url.hostname !== "127.0.0.1",
    (route) => route.abort("internetdisconnected"),
  );
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) api.push(url.href);
  });
  return api;
};

const visible = (locator: Locator) => locator.filter({ visible: true });
const sheet = (page: Page) => visible(page.getByRole("dialog"));
const button = (scope: Page | Locator, name: string | RegExp) =>
  visible(scope.getByRole("button", { name, exact: typeof name === "string" }));
const text = (scope: Page | Locator, value: string | RegExp) =>
  visible(scope.getByText(value, { exact: typeof value === "string" }));

/** Types an amount on a sheet's keypad, as a thumb would. */
async function keypad(page: Page, amount: string) {
  for (const key of amount) await button(sheet(page), key).click();
}

async function clearKeypad(page: Page, length: number) {
  for (let i = 0; i < length; i++) await button(sheet(page), "Delete").click();
}

async function home(page: Page) {
  await page.goto("/");
  await expect(visible(page.getByRole("heading", { name: "Your play" }))).toBeVisible();
  await expect(text(page, "Saved on this device")).toBeVisible();
}

async function start(page: Page, amount: string) {
  await button(page, "Start session").click();
  await keypad(page, amount);
  await button(sheet(page), "Start session").click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  await expect(visible(page.getByRole("heading", { name: "Session" }))).toBeVisible();
}

async function rebuy(page: Page, amount: string) {
  await button(page, "Rebuy").click();
  await keypad(page, amount);
  await button(sheet(page), "Record rebuy").click();
  await expect(sheet(page)).toHaveCount(0);
}

async function cashOut(page: Page, amount: string, after: "Keep playing" | "Finish playing") {
  await button(page, "Cash out").click();
  await keypad(page, amount);
  await visible(sheet(page).getByRole("radio", { name: after })).click();
  await button(
    sheet(page),
    after === "Keep playing" ? "Record cash-out" : "Cash out and finish",
  ).click();
  await expect(sheet(page)).toHaveCount(0);
}

const hero = (page: Page) =>
  visible(page.getByText(/^(Total in|Final result)$/))
    .first()
    .locator("xpath=ancestor::div[2]");

async function expectLive(page: Page, totalIn: string, totalOut: string) {
  await expect(text(page, "Live")).toBeVisible();
  await expect(text(page, "Final result pending until you finish playing.")).toBeVisible();
  await expect(hero(page)).toContainText(`Total in${totalIn}`);
  await expect(hero(page)).toContainText(`Total out${totalOut}`);
}

async function expectFinished(page: Page, result: string, amounts: string) {
  await expect(text(page, "Finished")).toBeVisible();
  await expect(text(page, "Final result")).toBeVisible();
  await expect(text(page, result).first()).toBeVisible();
  await expect(text(page, amounts)).toBeVisible();
  await expect(text(page, "Saved on this device")).toBeVisible();
}

/** Back to your play the way a person would: the header's back button. */
async function back(page: Page) {
  await visible(page.getByRole("link", { name: "Go back" })).click();
  await expect(visible(page.getByRole("heading", { name: "Your play" }))).toBeVisible();
}

test("records the milestone session through reloads without an account", async ({
  page,
  context,
}) => {
  const api = await isolate(context);
  await home(page);
  await expect(text(page, "No sessions yet")).toBeVisible();

  await start(page, "200");
  await expectLive(page, "$200", "$0");
  await rebuy(page, "100");
  await expect(text(page, "Rebuy of $100 recorded.")).toBeVisible();
  await cashOut(page, "100", "Keep playing");
  await expect(text(page, "Cash-out of $100 recorded. You're still playing.")).toBeVisible();
  await expectLive(page, "$300", "$100");

  await page.reload();
  await expectLive(page, "$300", "$100");
  await back(page);
  await expect(text(page, "Playing now")).toBeVisible();
  await expect(text(page, /In \$300 · Out \$100 · Result pending/)).toBeVisible();
  await expect(text(page, "Finished results")).toHaveCount(0);
  await button(page, /^Session, live/).click();

  await button(page, "Cash out").click();
  await expect(text(sheet(page), "Just this cash-out. Earlier ones total $100.")).toBeVisible();
  await button(sheet(page), "Close").click();
  await expect(sheet(page)).toHaveCount(0);
  await cashOut(page, "250", "Finish playing");
  await expect(
    text(page, "Cash-out of $250 recorded. You've finished this session."),
  ).toBeVisible();
  await expectFinished(page, "+$50", "In $300 · Out $350");
  await page.reload();
  await expectFinished(page, "+$50", "In $300 · Out $350");
  await expect(button(page, "Start another session")).toBeVisible();
  await expect(button(page, "Rebuy")).toHaveCount(0);

  await back(page);
  await expect(text(page, "Playing now")).toHaveCount(0);
  await expect(text(page, "Finished results")).toBeVisible();
  await expect(text(page, /^1 finished session\./)).toBeVisible();
  await expect(button(page, /Session, in \$300, out \$350, result \+\$50$/)).toBeVisible();
  expect(api).toEqual([]);
});

test("corrects, voids and fixes an accidental finish, and the audit survives reload", async ({
  page,
  context,
}) => {
  const api = await isolate(context);
  await home(page);
  await start(page, "200");
  await button(page, "Cash out").click();
  await button(sheet(page), "Nothing to cash out · $0").click();
  await visible(sheet(page).getByRole("radio", { name: "Finish playing" })).click();
  await button(sheet(page), "Cash out and finish").click();
  await expect(sheet(page)).toHaveCount(0);
  await expectFinished(page, "-$200", "In $200 · Out $0");

  await button(page, "Fix accidental finish").click();
  await button(sheet(page), "Reopen session").click();
  await expect(text(sheet(page), "Say what happened.")).toBeVisible();
  await expect(text(sheet(page), /^Your \$0 final cash-out stays recorded\./)).toBeVisible();
  await sheet(page).getByLabel("What happened").fill("Tapped finish by mistake");
  await button(sheet(page), "Reopen session").click();
  await expect(sheet(page)).toHaveCount(0);
  await expectLive(page, "$200", "$0");
  await expect(text(page, /^Reopened after an accidental finish\./)).toBeVisible();
  await expect(text(page, "Reopened: Tapped finish by mistake")).toBeVisible();
  await expect(text(page, "Finished playing")).toBeVisible();

  await button(page, "Review cash-out").click();
  await expect(visible(sheet(page).getByRole("heading", { name: "Final cash-out" }))).toBeVisible();
  await button(sheet(page), "Void entry").click();
  await sheet(page).getByLabel("Why").fill("Still playing");
  await button(sheet(page), "Void entry").click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(text(page, "Entry voided. It stays in the history.")).toBeVisible();
  await expect(text(page, /^Reopened after an accidental finish\./)).toHaveCount(0);

  await button(page, /^Buy-in, \$200/).click();
  await button(sheet(page), "Correct amount").click();
  await expect(text(sheet(page), "$200")).toBeVisible();
  await clearKeypad(page, 3);
  await keypad(page, "150");
  await sheet(page).getByLabel("What was wrong").fill("Miscounted");
  await button(sheet(page), "Save correction").click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(text(page, "Correction saved.")).toBeVisible();
  await expectLive(page, "$150", "$0");

  await page.reload();
  await expectLive(page, "$150", "$0");
  await button(page, /^Buy-in, \$200.*voided/).click();
  await expect(text(sheet(page), /Miscounted$/)).toBeVisible();
  await button(sheet(page), "View correction").click();
  await expect(text(sheet(page), "$150")).toBeVisible();
  await button(sheet(page), "View original").click();
  await expect(text(sheet(page), "$200")).toBeVisible();
  await button(sheet(page), "Close").click();
  await expect(button(page, /^Final cash-out, \$0.*voided/)).toBeVisible();

  await rebuy(page, "100");
  await cashOut(page, "0", "Finish playing");
  await expectFinished(page, "-$250", "In $250 · Out $0");

  await button(page, /^Buy-in, \$100/).click();
  await button(sheet(page), "Correct amount").click();
  await clearKeypad(page, 3);
  await keypad(page, "50");
  await sheet(page).getByLabel("What was wrong").fill("Was a $50 rebuy");
  await expect(text(sheet(page), /^The session stays finished/)).toBeVisible();
  await button(sheet(page), "Save correction").click();
  await expect(sheet(page)).toHaveCount(0);
  await expectFinished(page, "-$200", "In $200 · Out $0");
  await page.reload();
  await expectFinished(page, "-$200", "In $200 · Out $0");
  expect(api).toEqual([]);
});

test("adds a completed past session from totals and times", async ({ page, context }) => {
  const api = await isolate(context);
  await home(page);
  await button(page, "Add past session").click();
  const form = sheet(page);
  await form.getByLabel("Total in").fill("500");
  await form.getByLabel("Total out").fill("820.50");
  await form.getByLabel("Date").fill("2026-11-01");
  await form.getByLabel("Started").fill("25:00");
  await form.getByLabel("Finished").fill("01:15");
  await button(form, "Add session").click();
  await expect(text(form, "Enter a time like 21:30.")).toBeVisible();
  await expect(form.getByLabel("Total out")).toHaveValue("820.50");
  await form.getByLabel("Started").fill("21:30");
  await expect(text(form, "Enter a time like 21:30.")).toHaveCount(0);
  await button(form, /^Game: Not set/).click();
  await visible(form.getByRole("radio", { name: "Blackjack" })).click();
  await button(form, "Add session").click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(visible(page.getByRole("heading", { name: "Blackjack" }))).toBeVisible();
  await expectFinished(page, "+$320.50", "In $500 · Out $820.50");
  await expect(text(page, /9:30\sPM to 1:15\sAM/)).toBeVisible();
  await back(page);
  await expect(
    button(page, /Blackjack, in \$500, out \$820\.50, result \+\$320\.50$/),
  ).toBeVisible();
  expect(api).toEqual([]);
});

test("explains invalid amounts beside the keypad and keeps what was typed", async ({
  page,
  context,
}) => {
  await isolate(context);
  await home(page);
  await button(page, "Start session").click();
  const submit = button(sheet(page), "Start session");
  await submit.click();
  await expect(text(sheet(page), "Enter an amount.")).toBeVisible();
  for (const [typed, error] of [
    ["0", "Enter an amount greater than zero."],
    ["12.345", "Use whole cents, like 12.50."],
    ["99999999999999999999", "That amount is too large."],
  ] as const) {
    await keypad(page, typed);
    await submit.click();
    await expect(text(sheet(page), error)).toBeVisible();
    await expect(text(sheet(page), typed)).toBeVisible();
    await clearKeypad(page, typed.length);
  }
  await keypad(page, "20");
  await expect(text(sheet(page), "$20")).toBeVisible();
  await expect(text(sheet(page), /^Enter an amount/)).toHaveCount(0);
  await submit.click();
  await expect(page).toHaveURL(/\/play\//);
});

test("groups and trips wait for sign-in, and your play stays a tap away", async ({
  page,
  context,
}) => {
  const api = await isolate(context);
  await home(page);
  await button(page, "You").click();
  await expect(
    text(sheet(page), /^Sessions you record are saved on this device only\./),
  ).toBeVisible();
  await expect(text(sheet(page), /^Sign-in isn't set up in this copy of Color Up\./)).toBeVisible();
  await visible(sheet(page).getByRole("radio", { name: "Light" })).click();
  await button(sheet(page), "Close").click();

  await button(page, "Groups").click();
  await expect(text(page, /^Groups and trips need sign-in/)).toBeVisible();
  await button(page, "Back to your play").click();
  await expect(visible(page.getByRole("heading", { name: "Your play" }))).toBeVisible();

  await page.goto("/join/some-code");
  await expect(text(page, /^Groups and trips need sign-in/)).toBeVisible();
  await button(page, "Back to your play").click();
  await expect(text(page, "No sessions yet")).toBeVisible();

  await page.goto("/play/00000000-0000-4000-8000-000000000000");
  await expect(text(page, "This session isn't on this device")).toBeVisible();
  await button(page, "Back to your play").click();
  await expect(text(page, "No sessions yet")).toBeVisible();
  expect(api).toEqual([]);
});
