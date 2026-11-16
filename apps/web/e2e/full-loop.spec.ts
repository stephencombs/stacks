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
  await expect(phonePage.locator(".animate-skeleton.bg-fill")).toHaveCount(0);
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

  test("create, invite, play and close", async ({ browser }) => {
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
    // Signing in lands on Play; groups are in the Crew tab.
    await alex
      .getByRole("navigation", { name: "Tabs" })
      .getByRole("link", { name: "Crew" })
      .click();
    await expect(alex).toHaveTitle("Crew · Color Up");
    await alex.getByRole("button", { name: "New group" }).click();
    await alex.getByLabel("Group name").fill("Vegas crew");
    await expect(alex.getByLabel("Your name in this group")).toHaveValue("Alex");
    await alex.getByRole("button", { name: "Create group" }).click();
    await expect(alex.getByRole("heading", { name: "Vegas crew" })).toBeVisible();
    await expect(alex).toHaveTitle("Vegas crew · Color Up");

    // Alex invites Bea and adds Gus as a guest.
    await alex.getByRole("link", { name: /^1 member/ }).click();
    await expect(alex).toHaveTitle("People · Vegas crew · Color Up");
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
    await expect(bea.getByRole("heading", { name: "Name your first trip" })).toBeVisible();

    // Revoking the used link asks first.
    await alex.getByRole("button", { name: "Revoke" }).click();
    await alex.getByRole("button", { name: "Revoke link" }).click();
    await expect(alex.getByText("Make a link and send it", { exact: false })).toBeVisible();

    // Alex starts the group's first trip, then a session in it at a venue he adds.
    await alex.getByRole("link", { name: "Vegas crew" }).click();
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
    // The shell also marks the trip and the sidebar card Live. The session's own tag is in main.
    await expect(alex.getByRole("main").getByText("Live", { exact: true })).toBeVisible();

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
    // One press repeats a player's last buy-in, and the bar that confirms it undoes it.
    const gus = alex.getByRole("button", { name: /^Gus, / });
    await alex.getByRole("button", { name: "Rebuy $100 for Gus", exact: true }).click();
    await expect(gus).toContainText("In $200");
    await alex
      .getByRole("status")
      .filter({ hasText: "Gus bought in" })
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(alex.getByText("Voided by Alex: Undone")).toBeVisible();
    await expect(gus).toContainText("In $100");
    // The trip's stats wait on a finished session, and Crew keeps the live bar one click away.
    await alex.getByRole("link", { name: "Vegas weekend" }).first().click();
    await alex.getByRole("link", { name: "Stats", exact: true }).click();
    await expect(alex.getByText("No finished sessions yet")).toBeVisible();
    await alex
      .getByRole("navigation", { name: "Tabs" })
      .getByRole("link", { name: "Crew" })
      .click();
    await alex.getByRole("link", { name: /^Back to (your|the) table/ }).click();

    await alex.getByRole("button", { name: "Close session" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Close session" }).click();
    await expect(
      alex.getByText("Enter what each of them cashed out, 0 if they busted."),
    ).toBeVisible();
    await alex.keyboard.press("Escape");

    await record("Cash out", "Alex", "320");
    // Bea busted: Bust fills $0, so no amount to type.
    await alex.getByRole("button", { name: /^Bea, / }).click();
    await alex.getByRole("button", { name: "Bust · $0" }).click();
    await alex.getByRole("button", { name: "Record cash out" }).click();
    await record("Cash out", "Gus", "120", "Alex");
    await expect(gus).toContainText("+$20");
    await shoot(alex, "session-live");

    // Away from the table it's one tap away on the live bar.
    await alex
      .getByRole("navigation", { name: "Tabs" })
      .getByRole("link", { name: "Crew" })
      .click();
    await alex.getByRole("link", { name: /^Back to (your|the) table/ }).click();
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

    // The trip's stats rank the night, with each member's stat sheet a click away.
    await alex.getByRole("link", { name: "See the trip's stats" }).click();
    const standings = alex.getByRole("list", { name: "Standings" });
    await expect(standings.getByRole("listitem").first()).toContainText("+$170");
    await expect(alex.getByRole("heading", { name: "Awards" })).toBeVisible();
    await standings.getByRole("button", { name: /Alex/ }).click();
    await expect(alex.getByRole("dialog")).toContainText("Vegas weekend · Rank 1");
    await alex.keyboard.press("Escape");
    await standings.getByRole("button", { name: /Bea/ }).click();
    await expect(alex.getByRole("dialog")).toContainText("Vegas weekend · Rank 3");
    await alex.keyboard.press("Escape");
    await shoot(alex, "trip-stats");
    // Sessions heads each night with how it went for you.
    await alex.goBack();
    await alex.getByRole("link", { name: "Vegas weekend" }).first().click();
    await expect(alex.getByRole("heading", { name: /^Day 1 · / })).toBeVisible();
    await shoot(alex, "trip-sessions");

    // Alex backs Bea; the stake stays listed until it's voided.
    await alex.getByRole("button", { name: "Back a player" }).click();
    await alex.getByLabel("Who's playing it").selectOption({ label: "Bea" });
    await alex.getByLabel("Amount").fill("100");
    await alex.getByRole("button", { name: "Back them" }).click();
    await expect(alex.getByText("Alex backed Bea $100 · 50% of winnings")).toBeVisible();
    await expect(alex.getByText("Bea is even · owes back $100")).toBeVisible();
    await shoot(alex, "backing");
    await alex.getByRole("button", { name: /^Actions for Alex backed Bea/ }).click();
    await alex.getByRole("menuitem", { name: "Void" }).click();
    await alex.getByRole("button", { name: "Void stake" }).click();
    await expect(alex.getByText("Voided")).toBeVisible();

    // The trip ends and reopens from its Sessions; a trip with nothing in it can be deleted.
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "End trip" }).click();
    await expect(alex.getByText("Ended", { exact: true })).toBeVisible();
    await alex.getByRole("button", { name: "Actions for Vegas weekend" }).click();
    await alex.getByRole("menuitem", { name: "Reopen trip" }).click();
    await expect(alex.getByText("Ended", { exact: true })).toHaveCount(0);
    await alex.getByRole("link", { name: "Vegas crew" }).first().click();
    await alex.getByRole("button", { name: "New trip" }).click();
    await alex.getByLabel("Trip name").fill("Maybe Reno");
    await alex.getByRole("button", { name: "Start trip" }).click();
    await alex.getByRole("button", { name: "Actions for Maybe Reno" }).click();
    await alex.getByRole("menuitem", { name: "Delete trip" }).click();
    await alex.getByRole("button", { name: "Delete trip" }).click();
    await expect(alex.getByRole("heading", { name: "Vegas crew" })).toBeVisible();
    await shoot(alex, "group-home");

    // Clearing the trip filter shows All time for the group; a stat sheet opens on tap.
    await alex
      .getByRole("link", { name: /^Vegas weekend/ })
      .first()
      .click();
    await alex.getByRole("link", { name: "Stats", exact: true }).click();
    await alex.getByRole("button", { name: "Clear period filter" }).click();
    await expect(alex.getByRole("button", { name: "Period: All time" })).toBeVisible();
    await expect(alex.getByRole("button", { name: /^Craps, / })).toBeVisible();
    await alex.getByRole("button", { name: /Alex/ }).click();
    await expect(alex.getByRole("dialog")).toContainText("All time · Rank 1");
    await alex.keyboard.press("Escape");
    await alex.getByRole("button", { name: /Bea/ }).click();
    await expect(alex.getByRole("dialog")).toContainText("All time · Rank 3");
    await alex.keyboard.press("Escape");

    // On a phone, the standings open a stat sheet with a tap.
    const phone = await browser.newContext({
      storageState: await alex.context().storageState(),
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const phonePage = await phone.newPage();
    await phonePage.goto(alex.url());
    await phonePage.getByRole("button", { name: "Group: Just me" }).tap();
    await phonePage.getByRole("menuitemradio", { name: "Vegas crew" }).click();
    await phonePage.getByRole("button", { name: /Bea/ }).tap();
    await expect(phonePage.getByRole("dialog")).toContainText("All time · Rank 3");
    await phone.close();
    await shoot(alex, "stats");
  });
});
