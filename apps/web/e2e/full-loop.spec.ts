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
    test.slow();
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

    // Alex backs Bea: Settle up asks for the stake back until it's voided.
    await alex.getByRole("button", { name: "Back a player" }).click();
    await alex.getByLabel("Who's playing it").selectOption({ label: "Bea" });
    await alex.getByLabel("Amount").fill("100");
    await alex.getByRole("button", { name: "Back them" }).click();
    await expect(alex.getByText("Alex backed Bea $100.00 · 50% of winnings")).toBeVisible();
    await expect(alex.getByText("Bea is even · owes back $100.00")).toBeVisible();
    await expect(alex.getByRole("button", { name: "Mark paid" })).toHaveCount(1);
    await shoot(alex, "backing");
    await alex.getByRole("button", { name: /^Actions for Alex backed Bea/ }).click();
    await alex.getByRole("menuitem", { name: "Void" }).click();
    await alex.getByRole("button", { name: "Void stake" }).click();
    await expect(alex.getByText("Everyone's square")).toBeVisible();
    await expect(alex.getByText("Voided")).toBeVisible();

    // Alex starts a trip from this morning, so tonight's session lands on its board.
    await alex
      .getByRole("navigation", { name: "Group" })
      .getByRole("link", { name: "Sessions" })
      .click();
    await alex.getByRole("button", { name: "Start a trip" }).click();
    await alex.getByLabel("Trip name").fill("Vegas weekend");
    await alex.getByRole("button", { name: "Start trip" }).click();
    await alex.getByRole("link", { name: /Vegas weekend/ }).click();
    await expect(alex.getByRole("heading", { name: "Vegas weekend" })).toBeVisible();
    const board = alex.getByRole("list").filter({ hasText: "SESS" });
    await expect(board.getByRole("listitem").first()).toContainText("+$170");
    await expect(alex.getByText("Biggest hit")).toBeVisible();
    await shoot(alex, "trip-board");
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "End trip" }).click();
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "Reopen trip" }).click();
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "Delete trip" }).click();
    await alex.getByRole("button", { name: "Delete trip" }).click();
    await expect(alex.getByRole("button", { name: "Start a trip" })).toBeVisible();
    await alex.getByRole("link", { name: "Settle up" }).first().click();

    // Bea sees the same ledger.
    await bea.reload();
    await bea.getByRole("link", { name: "Sessions" }).click();
    await expect(bea.getByText("Settled up")).toHaveCount(3);
    await alex.getByRole("link", { name: "Stats" }).click();
    await expect(alex.getByRole("cell", { name: "Craps" })).toBeVisible();
    await expect(alex.getByRole("listitem").filter({ hasText: "you" })).toContainText("+$170.00");
    const chart = alex.getByRole("figure");
    await expect(chart).toContainText("Up in 1 of 1");
    await alex.getByRole("group", { name: /Your result in each session/ }).hover();
    await expect(chart).toContainText("+$170.00 overall after it");
    await alex.getByRole("button", { name: "Running total" }).click();
    await expect(chart).toContainText("After 1 session");
    await expect(chart).toContainText("+$170.00");
    // Anyone's stats, and the group's, are a tap away.
    await alex.getByRole("button", { name: /Bea/ }).click();
    await expect(alex.getByRole("heading", { name: "Bea's sessions" })).toBeVisible();
    await expect(chart).toContainText("-$200.00");
    await alex.getByRole("button", { name: /Group total/ }).click();
    await expect(alex.getByRole("heading", { name: "The group's sessions" })).toBeVisible();
    await expect(chart).toContainText("-$10.00");

    // On a phone, scrolling with a finger on the chart leaves it alone; a tap picks a session.
    const phone = await browser.newContext({
      storageState: await alex.context().storageState(),
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const phonePage = await phone.newPage();
    await phonePage.goto(alex.url());
    await phonePage.getByRole("button", { name: "Running total" }).tap();
    const plot = phonePage.getByRole("group", { name: /Your net after each session/ });
    const caption = phonePage.locator("figcaption");
    await expect(caption).toContainText("After 1 session");
    const box = (await plot.boundingBox())!;
    const finger = (y: number) => [{ x: box.x + box.width / 2, y }];
    const cdp = await phone.newCDPSession(phonePage);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: finger(box.y + 150),
    });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: finger(box.y + 150 - i * 30),
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(caption).toContainText("After 1 session");
    await plot.tap();
    await expect(caption).toContainText("won $170.00");
    await phone.close();
    await shoot(alex, "stats");
  });
});
