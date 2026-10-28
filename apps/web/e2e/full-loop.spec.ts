import { expect, test, type Page } from "@playwright/test";

import { createUsers, deleteUsers, signIn } from "./users";

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR;
const shoot = async (page: Page, name: string) => {
  if (!SCREENSHOTS) return;
  await page.screenshot({ path: `${SCREENSHOTS}/${name}-desktop.png`, fullPage: true });
  // The same page on a touch screen, so touch-only sizes apply.
  const phone = await page
    .context()
    .browser()!
    .newContext({
      storageState: await page.context().storageState(),
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
  const phonePage = await phone.newPage();
  await phonePage.goto(page.url());
  await expect(phonePage.locator("main h1")).toBeVisible();
  await expect(phonePage.locator(".animate-pulse")).toHaveCount(0);
  await phonePage.screenshot({ path: `${SCREENSHOTS}/${name}-phone.png`, fullPage: true });
  await phone.close();
};

test.describe.serial("a group's first night out", () => {
  let users: Awaited<ReturnType<typeof createUsers>> = [];
  test.beforeAll(async () => {
    users = await createUsers(["Alex", "Bea"]);
  });
  test.afterAll(async () => {
    await deleteUsers(users);
  });

  test("create, invite, play, close and settle up", async ({ browser }) => {
    const [alexUser, beaUser] = users;
    const alex = await (await browser.newContext()).newPage();
    const bea = await (await browser.newContext()).newPage();

    // Alex starts a group.
    await signIn(alex, alexUser!.emailAddress);
    await expect(alex.getByRole("heading", { name: "Your groups" })).toBeVisible();
    await alex.getByRole("button", { name: "New group" }).click();
    await alex.getByLabel("Group name").fill("Vegas crew");
    await expect(alex.getByLabel("Your name in this group")).toHaveValue("Alex");
    await alex.getByRole("button", { name: "Create group" }).click();
    await expect(alex.getByRole("heading", { name: "Vegas crew" })).toBeVisible();

    // Alex invites Bea and adds Gus as a guest.
    await alex.getByRole("link", { name: "People" }).click();
    await alex.getByRole("button", { name: "New invite link" }).click();
    const inviteLink = (await alex.getByText(/\/join\//).textContent())!;
    await alex.getByRole("button", { name: "Add a guest" }).click();
    await alex.getByLabel("Name", { exact: true }).fill("Gus");
    await alex.getByRole("button", { name: "Add guest" }).click();
    await expect(alex.getByRole("button", { name: "Copy claim link" })).toBeVisible();

    await signIn(bea, beaUser!.emailAddress);
    await bea.goto(new URL(inviteLink).pathname);
    await expect(bea.getByRole("heading", { name: "Vegas crew" })).toBeVisible();
    await bea.getByRole("button", { name: "Join group" }).click();
    await expect(bea.getByRole("link", { name: "Settle up" })).toBeVisible();

    // Revoking the used link asks first.
    await alex.getByRole("button", { name: "Revoke" }).click();
    await alex.getByRole("button", { name: "Revoke link" }).click();
    await expect(alex.getByText("Make a link and send it", { exact: false })).toBeVisible();

    // Alex starts a session at a venue he adds to the catalog.
    await alex.getByRole("link", { name: "Sessions" }).click();
    await alex.getByRole("link", { name: "Start a session" }).first().click();
    await alex.getByRole("button", { name: "Add a venue" }).click();
    await alex.getByLabel("Name", { exact: true }).fill(`Bellagio test ${Date.now().toString(36)}`);
    await alex.getByLabel("City").fill("Las Vegas");
    await alex.getByRole("button", { name: "Add venue" }).click();
    await alex.getByText("Craps", { exact: true }).click();
    await alex.getByRole("checkbox", { name: /Member 1|Bea/ }).check();
    await alex.getByRole("checkbox", { name: /Gus/ }).check();
    await shoot(alex, "new-session");
    await alex.getByRole("button", { name: "Start session" }).click();
    await expect(alex.getByText("Live", { exact: true })).toBeVisible();

    const record = async (
      action: "Buy in" | "Cash out",
      player: string,
      amount: string,
      counterparty?: string,
    ) => {
      await alex.getByRole("button", { name: `${action} for ${player}` }).click();
      await alex.getByLabel("Amount").fill(amount);
      if (counterparty) {
        await alex
          .getByLabel(action === "Buy in" ? "Whose money" : "Who has the cash")
          .selectOption({ label: counterparty });
      }
      await alex
        .getByRole("button", { name: action === "Buy in" ? "Record buy in" : "Record cash out" })
        .click();
      await expect(alex.getByRole("dialog")).toBeHidden();
    };

    // Bea covers $50 of Alex's chips; Alex holds Gus's winnings.
    await record("Buy in", "Alex", "100");
    await record("Buy in", "Bea", "200");
    await record("Buy in", "Alex", "50", "Bea");
    await record("Buy in", "Gus", "100");

    await alex.getByRole("button", { name: "Close session" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Close session" }).click();
    await expect(
      alex.getByText("Everyone who bought in needs a cash-out first.", { exact: false }),
    ).toBeVisible();
    await alex.getByRole("button", { name: "Keep playing" }).click();

    await record("Cash out", "Alex", "320");
    await record("Cash out", "Bea", "0");
    await record("Cash out", "Gus", "120", "Alex");
    await shoot(alex, "session-live");

    await alex.getByRole("button", { name: "Close session" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Close session" }).click();
    await expect(alex.getByText("Closed", { exact: true })).toBeVisible();
    await expect(alex.getByText("+$170.00")).toBeVisible();
    await expect(alex.getByText("-$200.00")).toBeVisible();
    await expect(alex.getByText("+$20.00")).toBeVisible();

    // Alex owes Bea $50 for the buy-in and Gus $120 for the cash he kept.
    await alex.getByRole("link", { name: "Vegas crew" }).click();
    await expect(alex.getByText("Owes $170.00")).toBeVisible();
    await expect(alex.getByText("Owed $50.00")).toBeVisible();
    await expect(alex.getByText("Owed $120.00")).toBeVisible();
    await shoot(alex, "group-home");

    await alex.getByRole("link", { name: "Settle up" }).first().click();
    await expect(alex.getByRole("button", { name: "Mark paid" })).toHaveCount(2);
    await shoot(alex, "settle-up");
    for (let i = 0; i < 2; i++) {
      await alex.getByRole("button", { name: "Mark paid" }).first().click();
      await alex.getByRole("button", { name: "Record payment" }).click();
      await expect(alex.getByRole("dialog")).toBeHidden();
    }
    await expect(alex.getByText("Everyone's square")).toBeVisible();

    // Bea sees the same ledger.
    await bea.reload();
    await bea.getByRole("link", { name: "Sessions" }).click();
    await expect(bea.getByText("Settled up")).toHaveCount(3);
    await alex.getByRole("link", { name: "Stats" }).click();
    await expect(alex.getByRole("cell", { name: "Craps" })).toBeVisible();
    const chart = alex.getByRole("figure");
    await expect(chart).toContainText("After 1 session");
    await expect(chart).toContainText("+$170.00");
    await shoot(alex, "stats");
  });
});
