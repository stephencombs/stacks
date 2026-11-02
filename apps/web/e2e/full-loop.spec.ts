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
  // Skeletons, not the pulsing live dots.
  await expect(phonePage.locator(".animate-pulse.bg-sunken")).toHaveCount(0);
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

    // Production refetches slower than a local server; entries must keep counting between the
    // server confirming them and the session coming back with them.
    await alex.route(/\/api\/sessions\/[^/]+$/, async (route) => {
      if (route.request().method() === "GET") await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });

    // Alex starts a group.
    await signIn(alex, alexUser!.emailAddress);
    await expect(alex.getByRole("heading", { name: "Your groups" })).toBeVisible();
    await alex.getByRole("button", { name: "New group" }).click();
    await alex.getByLabel("Group name").fill("Vegas crew");
    await expect(alex.getByLabel("Your name in this group")).toHaveValue("Alex");
    await alex.getByRole("button", { name: "Create group" }).click();
    await expect(alex.getByRole("heading", { name: "Vegas crew" })).toBeVisible();
    await expect(alex).toHaveTitle("Trips · Vegas crew · Stacks");

    // Alex invites Bea and adds Gus as a guest.
    await alex.getByRole("link", { name: "People" }).click();
    await expect(alex).toHaveTitle("People · Vegas crew · Stacks");
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
    await expect(bea.getByRole("link", { name: "Trips" })).toBeVisible();

    // Revoking the used link asks first.
    await alex.getByRole("button", { name: "Revoke" }).click();
    await alex.getByRole("button", { name: "Revoke link" }).click();
    await expect(alex.getByText("Make a link and send it", { exact: false })).toBeVisible();

    // Alex starts the group's first trip, then a session in it at a venue he adds.
    await alex.getByRole("link", { name: "Trips" }).click();
    await alex.getByLabel("Trip name").fill("Vegas weekend");
    await alex.getByRole("button", { name: "Start trip" }).click();
    await expect(alex.getByRole("heading", { name: "Start a session" })).toBeVisible();
    await alex.route(/\/api\/venues\?/, (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await alex.getByLabel("Search venues").fill("Unavailable venue");
    await expect(alex.getByRole("button", { name: "Retry venue search" })).toBeVisible();
    await expect(alex.getByText(/No venues match/)).toHaveCount(0);
    await alex.unroute(/\/api\/venues\?/);
    await alex.getByRole("button", { name: "Retry venue search" }).click();
    await expect(alex.getByText(/No venues match/)).toBeVisible();
    await alex.getByLabel("Search venues").fill("");
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

    // Picking a player opens one dialog for anything that happened to them.
    const record = async (
      kind: "Buy in" | "Cash out",
      player: string,
      amount: string,
      counterparty?: string,
    ) => {
      await alex.getByRole("button", { name: new RegExp(`^${player}, `) }).click();
      const dialog = alex.getByRole("dialog");
      await dialog.getByText(kind, { exact: true }).click();
      await dialog.getByLabel("Amount").fill("invalid");
      await dialog
        .getByRole("button", { name: kind === "Buy in" ? "Record buy in" : "Record cash out" })
        .click();
      await expect(dialog.getByLabel("Amount")).toHaveAttribute("aria-invalid", "true");
      await dialog.getByLabel("Amount").fill(amount);
      await expect(dialog.getByLabel("Amount")).not.toHaveAttribute("aria-invalid", "true");
      if (counterparty) {
        await dialog
          .getByLabel(kind === "Buy in" ? "Whose money" : "Who has the cash")
          .selectOption({ label: counterparty });
      }
      await dialog
        .getByRole("button", { name: kind === "Buy in" ? "Record buy in" : "Record cash out" })
        .click();
      await expect(dialog).toBeHidden();
    };

    // Bea covers $50 of Alex's chips; Alex holds Gus's winnings.
    await record("Buy in", "Alex", "100");
    await record("Buy in", "Bea", "200");
    await record("Buy in", "Alex", "50", "Bea");
    // With no connection, a buy-in is kept and sent once the connection is back.
    const sending = alex.getByText("Saved in this browser, sending");
    await expect(sending).toHaveCount(0);
    await alex.context().setOffline(true);
    await record("Buy in", "Gus", "100");
    await expect(sending).toBeVisible();
    await alex.context().setOffline(false);
    await expect(sending).toHaveCount(0);
    // One press repeats a player's last buy-in, and the same spot undoes it.
    const gus = alex.getByRole("button", { name: /^Gus, / });
    await alex.getByRole("button", { name: "Rebuy for Gus", exact: true }).click();
    await expect(gus).toContainText("In $200");
    await alex.getByRole("button", { name: "Undo rebuy for Gus" }).click();
    await expect(alex.getByText("Voided: Undone")).toBeVisible();
    await expect(gus).toContainText("In $100");
    // While everyone's at the table, tonight counts their chips as in play, not as losses.
    await alex.getByRole("link", { name: "Vegas weekend" }).click();
    const trip = alex.getByRole("navigation", { name: "Trip" });
    await trip.getByRole("link", { name: "Results" }).click();
    await alex.getByRole("button", { name: "Tonight", exact: true }).click();
    await expect(alex.getByText("$450", { exact: true })).toBeVisible();
    await expect(alex.getByRole("list", { name: "Tonight" })).toContainText("In play $150");
    await shoot(alex, "tonight-live");
    await alex.getByRole("link", { name: /^Back to your table/ }).click();

    await alex.getByRole("button", { name: "Close session" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Close session" }).click();
    await expect(
      alex.getByText("Enter what each of them cashed out, 0 if they busted."),
    ).toBeVisible();
    await alex.getByRole("button", { name: "Keep playing" }).click();

    await record("Cash out", "Alex", "320");
    // Bea busted: one press, no amount to type.
    await alex.getByRole("button", { name: /^Bea, / }).click();
    await alex.getByRole("button", { name: "Bust · $0" }).click();
    await record("Cash out", "Gus", "120", "Alex");
    await expect(gus).toContainText("+$20");
    await shoot(alex, "session-live");

    // Away from the table, the live bar keeps it one tap away.
    await alex.getByRole("link", { name: "Vegas weekend" }).click();
    await alex
      .getByRole("navigation", { name: "Trip" })
      .getByRole("link", { name: "Results" })
      .click();
    await alex.getByRole("link", { name: /^Back to your table/ }).click();
    await expect(alex.getByRole("button", { name: "Close session" })).toBeVisible();

    // Moving tables closes this one and opens the next with the same place, game and players.
    await alex.getByRole("button", { name: "Close session" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Close and move tables" }).click();
    await expect(alex.getByRole("heading", { name: "Start a session" })).toBeVisible();
    await expect(alex.getByRole("radio", { name: "Craps" })).toBeChecked();
    await expect(alex.getByRole("checkbox", { name: /Gus/ })).toBeChecked();
    await alex.goBack();
    await expect(alex.getByText("+$170").first()).toBeVisible();
    await expect(alex.getByRole("link", { name: "Start another session" })).toBeVisible();

    // The trip's board ranks the night.
    const tab = (name: string) =>
      alex.getByRole("navigation", { name: "Trip" }).getByRole("link", { name });
    await alex.getByRole("link", { name: "See results" }).click();
    await alex.getByRole("button", { name: "Tonight", exact: true }).click();
    const tonight = alex.getByRole("list", { name: "Tonight" });
    await expect(tonight.getByRole("listitem").first()).toContainText("+$170");
    await shoot(alex, "tonight");
    await alex.getByRole("button", { name: "Standings", exact: true }).click();
    const board = alex.getByRole("list", { name: "Standings" });
    await expect(board.getByRole("listitem").first()).toContainText("+$170");
    await expect(alex.getByText("Biggest hit")).toBeVisible();
    // The trip's numbers: one table where some won and some lost, so no team run yet.
    await expect(alex.getByText("0W · 0L · 1 mixed")).toBeVisible();
    await expect(alex.getByText("Largest drawdown")).toBeVisible();
    await shoot(alex, "trip-board");
    // Night by night, everyone's result, and nobody's missing night counted as even.
    await alex.getByRole("button", { name: "Days", exact: true }).click();
    await expect(alex.getByText("1W", { exact: true }).first()).toBeVisible();
    await shoot(alex, "trip-days");

    // Stats race the night and open a stat sheet for whoever's picked.
    await alex.getByRole("button", { name: "Race" }).click();
    await expect(alex.getByRole("heading", { name: /leads by \$150/ })).toBeVisible();
    await expect(alex.getByText("Win rate")).toBeVisible();

    // Alex owes Bea $50 for the buy-in and Gus $120 for the cash he kept.
    await tab("Settle up").click();
    await expect(alex.getByText("You owe $170")).toBeVisible();
    await expect(alex.getByText("Owes $170")).toBeVisible();
    await expect(alex.getByText("Owed $50")).toBeVisible();
    await expect(alex.getByText("Owed $120")).toBeVisible();
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
    await expect(alex.getByText("Alex backed Bea $100 · 50% of winnings")).toBeVisible();
    await expect(alex.getByText("Bea is even · owes back $100")).toBeVisible();
    await expect(alex.getByRole("button", { name: "Mark paid" })).toHaveCount(1);
    await shoot(alex, "backing");
    await alex.getByRole("button", { name: /^Actions for Alex backed Bea/ }).click();
    await alex.getByRole("menuitem", { name: "Void" }).click();
    await alex.getByRole("button", { name: "Void stake" }).click();
    await expect(alex.getByText("Everyone's square")).toBeVisible();
    await expect(alex.getByText("Voided")).toBeVisible();

    // The trip ends and reopens; a trip with nothing in it can be deleted.
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "End trip" }).click();
    await expect(alex.getByText("Ended", { exact: true })).toBeVisible();
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "Reopen trip" }).click();
    await expect(alex.getByText("Ended", { exact: true })).toHaveCount(0);
    await alex.getByRole("button", { name: "Vegas crew" }).click();
    await alex.getByRole("menuitem", { name: "Past trips" }).click();
    await alex.getByRole("button", { name: "Start a trip" }).click();
    await alex.getByLabel("Trip name").fill("Maybe Reno");
    await alex.getByRole("button", { name: "Start trip" }).click();
    await alex.getByRole("button", { name: "Actions for Maybe Reno" }).click();
    await alex.getByRole("menuitem", { name: "Delete trip" }).click();
    await alex.getByRole("button", { name: "Delete trip" }).click();
    await expect(alex.getByRole("heading", { name: "Vegas crew" })).toBeVisible();
    await shoot(alex, "group-home");

    // Bea sees the same ledger.
    await bea.reload();
    await bea.getByRole("link", { name: /Vegas weekend/ }).click();
    await bea
      .getByRole("navigation", { name: "Trip" })
      .getByRole("link", { name: "Settle up" })
      .click();
    await expect(bea.getByText("Square", { exact: true })).toHaveCount(3);
    // All-time stats race every trip; the stat sheet opens on you, and anyone else is a tap away.
    await alex.getByRole("link", { name: "Stats" }).click();
    await expect(alex.getByRole("cell", { name: "Craps" })).toBeVisible();
    await expect(alex.getByRole("heading", { name: /leads by \$150/ })).toBeVisible();
    await expect(alex.getByText("Alex · #1 of 3 · 1 session")).toBeVisible();
    await alex.getByRole("button", { name: /Bea/ }).click();
    await expect(alex.getByText("Bea · #3 of 3 · 1 session")).toBeVisible();

    // On a phone, the standings pick a player with a tap.
    const phone = await browser.newContext({
      storageState: await alex.context().storageState(),
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const phonePage = await phone.newPage();
    await phonePage.goto(alex.url());
    await phonePage.getByRole("button", { name: /Bea/ }).tap();
    await expect(phonePage.getByText("Bea · #3 of 3 · 1 session")).toBeVisible();
    await phone.close();
    await shoot(alex, "stats");
  });
});
