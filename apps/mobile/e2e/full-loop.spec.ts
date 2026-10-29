import { expect, test, type Page } from "@playwright/test";

import { createUsers, deleteUsers, signIn } from "./users";

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR;
const shoot = (page: Page, name: string) =>
  SCREENSHOTS
    ? page.screenshot({ path: `${SCREENSHOTS}/mobile-${name}.png`, fullPage: true })
    : Promise.resolve();

// The web stack keeps earlier screens mounted but hidden, so lookups only count visible text.
test.describe.serial("live mode on a phone", () => {
  let users: Awaited<ReturnType<typeof createUsers>> = [];
  test.beforeAll(async () => {
    users = await createUsers(["Alex", "Bea"]);
  });
  test.afterAll(async () => {
    await deleteUsers(users);
  });

  test("create, invite, play, close and settle up", async ({ browser }) => {
    const [alexUser, beaUser] = users;
    const contextOptions = test.info().project.use;
    const alex = await (await browser.newContext(contextOptions)).newPage();
    const bea = await (await browser.newContext(contextOptions)).newPage();

    await signIn(alex, alexUser!.emailAddress);
    await expect(alex.getByText("Your groups").filter({ visible: true })).toBeVisible();
    await alex.getByRole("button", { name: "New group" }).filter({ visible: true }).click();
    await alex.getByLabel("Group name").fill("Vegas crew");
    await expect(alex.getByLabel("Your name in this group")).toHaveValue("Alex");
    await alex.getByRole("button", { name: "Create group" }).filter({ visible: true }).click();
    await expect(
      alex.getByRole("button", { name: "Start a trip" }).filter({ visible: true }),
    ).toBeVisible();
    const groupUrl = alex.url();

    await alex.getByRole("button", { name: "People" }).filter({ visible: true }).click();
    await alex.getByRole("button", { name: "New invite link" }).filter({ visible: true }).click();
    const inviteLink = (await alex
      .getByText(/\/join\//)
      .filter({ visible: true })
      .textContent())!;
    await alex.getByRole("button", { name: "Add a guest" }).filter({ visible: true }).click();
    await alex.getByLabel("Name", { exact: true }).fill("Gus");
    await alex.getByRole("button", { name: "Add guest" }).filter({ visible: true }).click();
    await expect(
      alex.getByRole("button", { name: "Send claim link" }).filter({ visible: true }),
    ).toBeVisible();

    await signIn(bea, beaUser!.emailAddress);
    await bea.goto(new URL(inviteLink).pathname);
    await expect(bea.getByText("Vegas crew").filter({ visible: true })).toBeVisible();
    await bea.getByRole("button", { name: "Join group" }).filter({ visible: true }).click();
    await expect(
      bea.getByRole("button", { name: "Start a trip" }).filter({ visible: true }),
    ).toBeVisible();

    // Every session is part of a trip, so Alex starts one first.
    const visible = (locator: ReturnType<typeof alex.getByRole>) =>
      locator.filter({ visible: true });
    await alex.goto(groupUrl);
    await visible(alex.getByRole("button", { name: "Start a trip" })).click();
    await visible(alex.getByLabel("Trip name")).fill("Vegas weekend");
    await visible(alex.getByRole("button", { name: "Start trip" })).click();
    await visible(alex.getByRole("button", { name: "Start a session" })).click();
    await alex.getByRole("button", { name: "Add a venue" }).filter({ visible: true }).click();
    await alex.getByLabel("Name", { exact: true }).fill(`Wynn test ${Date.now().toString(36)}`);
    await alex.getByLabel("City").fill("Las Vegas");
    await alex.getByRole("button", { name: "Add venue" }).filter({ visible: true }).click();
    await alex.getByRole("radio", { name: "Craps" }).click();
    await alex.getByRole("checkbox", { name: "Bea" }).click();
    await alex.getByRole("checkbox", { name: "Gus" }).click();
    await shoot(alex, "new-session");
    await alex.getByRole("button", { name: "Start session" }).filter({ visible: true }).click();
    await expect(alex.getByText("Live", { exact: true }).filter({ visible: true })).toBeVisible();

    // Tapping a player opens the keypad; the kind, amount and whose money are all taps.
    const record = async (
      kind: "Buy in" | "Cash out",
      player: string,
      amount: string,
      counterparty?: string,
    ) => {
      await visible(alex.getByRole("button", { name: new RegExp(`^${player}, `) })).click();
      await visible(alex.getByRole("radio", { name: kind })).click();
      for (const key of amount)
        await visible(alex.getByRole("button", { name: key, exact: true })).click();
      if (counterparty) {
        await visible(
          alex.getByRole("button", { name: /^(Whose money|Who has the cash):/ }),
        ).click();
        await visible(alex.getByRole("radio", { name: counterparty })).click();
      }
      await visible(
        alex.getByRole("button", { name: kind === "Buy in" ? "Record buy in" : "Record cash out" }),
      ).click();
    };

    await record("Buy in", "Alex", "100");
    await record("Buy in", "Bea", "200");
    await record("Buy in", "Alex", "50", "Bea");
    // With no signal, a buy-in is kept on the phone and sent once there's signal again.
    const waiting = alex.getByText("Saved on this phone, sending").filter({ visible: true });
    await expect(waiting).toHaveCount(0);
    await alex.context().setOffline(true);
    await record("Buy in", "Gus", "100");
    await expect(waiting).toBeVisible();
    await alex.context().setOffline(false);
    await expect(waiting).toHaveCount(0);
    // One tap repeats Gus's last buy-in.
    await alex
      .getByRole("button", { name: "Rebuy for Gus", exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      alex.getByText("In $200 · Out $0").filter({ visible: true }).first(),
    ).toBeVisible();
    // A mistaken rebuy is undone from the same spot it was tapped.
    await alex
      .getByRole("button", { name: "Rebuy for Gus", exact: true })
      .filter({ visible: true })
      .click();
    await shoot(alex, "rebuy-undo");
    await visible(alex.getByRole("button", { name: "Undo rebuy for Gus" })).click();
    await expect(alex.getByText("Voided: Undone").filter({ visible: true })).toBeVisible();
    await expect(
      alex.getByText("In $200 · Out $0").filter({ visible: true }).first(),
    ).toBeVisible();

    // While everyone's at the table, tonight counts their chips as in play, not as losses.
    const tab = (name: string) => visible(alex.getByRole("tab", { name }));
    await tab("Board").click();
    await expect(visible(alex.getByLabel(/Alex, you: no result yet, \$150 in play/))).toBeVisible();
    await shoot(alex, "tonight-live");
    await tab("Table").click();

    await alex.getByRole("button", { name: "Close session" }).filter({ visible: true }).click();
    await alex
      .getByRole("button", { name: "Close session" })
      .filter({ visible: true })
      .last()
      .click();
    await expect(
      alex
        .getByText("Enter what each of them cashed out, 0 if they busted.")
        .filter({ visible: true }),
    ).toBeVisible();
    await alex.getByRole("button", { name: "Keep playing" }).filter({ visible: true }).click();

    await record("Cash out", "Alex", "320");
    await record("Cash out", "Gus", "220", "Alex");
    // Bea busted: one tap, no keypad.
    await visible(alex.getByRole("button", { name: /^Bea, / })).click();
    await visible(alex.getByRole("button", { name: "Bust · $0" })).click();
    await expect(alex.getByText("+$170").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("-$200").filter({ visible: true })).toBeVisible();
    await shoot(alex, "session-live");

    await alex.getByRole("button", { name: "Close session" }).filter({ visible: true }).click();
    await alex
      .getByRole("button", { name: "Close session" })
      .filter({ visible: true })
      .last()
      .click();
    // The closed table stays on screen with everyone's result, under the way to the next one.
    await expect(visible(alex.getByRole("button", { name: "Start a session" }))).toBeVisible();
    await expect(alex.getByText("Closed", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("-$200").filter({ visible: true }).first()).toBeVisible();

    // The trip's board ranks the night, and Money says who owes whom: Alex owes Bea $50 for the
    // buy-in and Gus $220 for the cash he kept.
    await tab("Board").click();
    // The board opens on tonight while anything happened tonight.
    await expect(visible(alex.getByLabel("1. Alex, you: +$170"))).toBeVisible();
    await shoot(alex, "tonight");
    await visible(alex.getByRole("radio", { name: "Trip" })).click();
    await expect(alex.getByText("Biggest hit").filter({ visible: true })).toBeVisible();
    await shoot(alex, "trip-board");
    await visible(alex.getByRole("radio", { name: "Race" })).click();
    await expect(alex.getByText(/leads by/).filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("Win rate").filter({ visible: true })).toBeVisible();
    await shoot(alex, "trip-stats");
    await tab("Money").click();
    await expect(alex.getByText("Owes $270").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("Owed $50").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("Owed $220").filter({ visible: true })).toBeVisible();
    const moneyUrl = `${new URL(alex.url()).pathname.replace(/\/$/, "")}?tab=money`;
    await expect(
      alex.getByRole("button", { name: "Mark paid" }).filter({ visible: true }),
    ).toHaveCount(2);
    await shoot(alex, "settle-up");
    for (let i = 0; i < 2; i++) {
      await alex
        .getByRole("button", { name: "Mark paid" })
        .filter({ visible: true })
        .first()
        .click();
      await alex.getByRole("button", { name: "Record payment" }).filter({ visible: true }).click();
    }
    await expect(alex.getByText("Everyone's square").filter({ visible: true })).toBeVisible();

    await bea.goto(moneyUrl);
    await expect(bea.getByText("Square", { exact: true }).filter({ visible: true })).toHaveCount(3);

    await alex.goto(groupUrl);
    await shoot(alex, "group");
    await alex.getByRole("button", { name: "Stats" }).filter({ visible: true }).click();
    await expect(
      alex.getByText("Alex · #1 of 3 · 1 session").filter({ visible: true }),
    ).toBeVisible();
    await alex.getByRole("button", { name: /Bea: / }).filter({ visible: true }).click();
    await expect(
      alex.getByText("Bea · #3 of 3 · 1 session").filter({ visible: true }),
    ).toBeVisible();
    await expect(alex.getByText("Craps").filter({ visible: true }).first()).toBeVisible();
    await shoot(alex, "stats");

    // The trip ends and reopens; a trip with nothing in it can be deleted.
    await alex.goto(groupUrl);
    await visible(alex.getByRole("button", { name: "Vegas weekend, live board" })).click();
    for (const action of ["End trip", "Reopen trip"]) {
      await visible(alex.getByRole("button", { name: "Trip options" })).click();
      await visible(alex.getByRole("button", { name: action })).click();
    }
    await alex.goto(groupUrl);
    await visible(alex.getByRole("button", { name: "Start a trip" })).click();
    await visible(alex.getByLabel("Trip name")).fill("Maybe Reno");
    await visible(alex.getByRole("button", { name: "Start trip" })).click();
    await visible(alex.getByRole("button", { name: "Trip options" })).click();
    await visible(alex.getByRole("button", { name: "Delete trip" })).click();
    await visible(alex.getByRole("button", { name: "Delete for good" })).click();
    await expect(
      visible(alex.getByRole("button", { name: "Vegas weekend, live board" })),
    ).toBeVisible();
  });
});
