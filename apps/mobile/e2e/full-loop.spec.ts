import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { createUsers, deleteUsers, signIn } from "./users";

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR;
const shoot = (page: Page, name: string) =>
  SCREENSHOTS
    ? page.screenshot({ path: `${SCREENSHOTS}/mobile-${name}.png`, fullPage: true })
    : Promise.resolve();

/**
 * Takes away what Chromium has and Hermes on iOS doesn't, so code the phone can't run fails here
 * too. The app's own polyfills then put back what it relies on.
 */
const hermesLike = (context: BrowserContext) => {
  void context.addInitScript(() => {
    const remove = (owner: object, key: PropertyKey) => Reflect.deleteProperty(owner, key);
    remove(Intl.NumberFormat.prototype, "formatToParts");
    remove(Array.prototype, "toSorted");
    remove(Array, "fromAsync");
    remove(globalThis, "structuredClone");
    remove(globalThis, "Iterator");
  });
  return context;
};

const id = "[0-9a-f-]{36}";
/** Waits for the page's address to match, then gives its path. A place names its trip once it knows it. */
const at = async (page: Page, pattern: string) => {
  await expect(page).toHaveURL(new RegExp(`^https?://[^/]+${pattern}$`));
  return new URL(page.url()).pathname;
};

// The web stack keeps earlier screens and the other places mounted but hidden, and a sheet leaves
// the screen under it in the page, so lookups only count visible elements.
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
    const alex = await hermesLike(await browser.newContext(contextOptions)).newPage();
    const bea = await hermesLike(await browser.newContext(contextOptions)).newPage();
    const visible = (locator: ReturnType<typeof alex.getByRole>) =>
      locator.filter({ visible: true });
    // The places along the bottom, and the scope button naming the group and trip at the top.
    const place = (page: Page, name: string) =>
      visible(page.getByRole("tab", { name, exact: true }));
    const scope = (page: Page, name: string) =>
      visible(page.getByRole("button", { name, exact: true }));

    await signIn(alex, alexUser!.emailAddress);
    // Signing in lands on personal Home; groups sit behind Groups in the header.
    await visible(alex.getByRole("button", { name: "Groups", exact: true })).click();
    await expect(visible(alex.getByRole("heading", { name: "Your groups" })).first()).toBeVisible();
    await visible(alex.getByRole("button", { name: "New group" })).click();
    await alex.getByLabel("Group name").fill("Vegas crew");
    await expect(alex.getByLabel("Your name in this group")).toHaveValue("Alex");
    await visible(alex.getByRole("button", { name: "Create group" })).click();
    // A group with no trips has nothing for the other places, so Group is the only one offered.
    await expect(visible(alex.getByRole("button", { name: "Start a trip" }))).toBeVisible();
    await expect(scope(alex, "Vegas crew, no trips yet")).toBeVisible();
    await expect(visible(alex.getByRole("tab"))).toHaveCount(1);
    await expect(place(alex, "Group")).toBeVisible();
    const groupPath = await at(alex, `/groups/${id}`);
    await shoot(alex, "group-empty");

    // People is pushed from the group hub, at its own address.
    await visible(alex.getByRole("button", { name: /^Members and guests/ })).click();
    await at(alex, `${groupPath}/people`);
    await visible(alex.getByRole("button", { name: "New invite link" })).click();
    const inviteLink = (await alex
      .getByText(/\/join\//)
      .filter({ visible: true })
      .textContent())!;
    await visible(alex.getByRole("button", { name: "Add a guest" })).click();
    await alex.getByLabel("Name", { exact: true }).fill("Gus");
    await visible(alex.getByRole("button", { name: "Add guest" })).click();
    await expect(visible(alex.getByRole("button", { name: "Send claim link" }))).toBeVisible();

    await signIn(bea, beaUser!.emailAddress);
    await bea.goto(new URL(inviteLink).pathname);
    await expect(bea.getByText("Vegas crew").filter({ visible: true }).first()).toBeVisible();
    await visible(bea.getByRole("button", { name: "Join group" })).click();
    await expect(visible(bea.getByRole("button", { name: "Start a trip" }))).toBeVisible();

    // Every session is part of a trip, so Alex starts one first. The other places arrive with it.
    await alex.goto(groupPath);
    await visible(alex.getByRole("button", { name: "Start a trip" })).click();
    await visible(alex.getByLabel("Trip name")).fill("Vegas weekend");
    await visible(alex.getByRole("button", { name: "Start trip" })).click();
    await expect(scope(alex, "Vegas crew, Vegas weekend")).toBeVisible();
    await expect(visible(alex.getByRole("tab"))).toHaveCount(4);
    await place(alex, "Sessions").click();
    const tripPath = await at(alex, `/trips/${id}`);
    await visible(alex.getByRole("button", { name: "Start a session" })).click();
    await visible(alex.getByRole("button", { name: "Add a venue" })).click();
    await alex.getByLabel("Name", { exact: true }).fill(`Wynn test ${Date.now().toString(36)}`);
    await alex.getByLabel("City").fill("Las Vegas");
    await visible(alex.getByRole("button", { name: "Add venue" })).click();
    await alex.getByRole("radio", { name: "Craps" }).click();
    await alex.getByRole("checkbox", { name: "Bea" }).click();
    await alex.getByRole("checkbox", { name: "Gus" }).click();
    await shoot(alex, "new-session");
    await visible(alex.getByRole("button", { name: "Start session" })).click();
    // The trip underneath stays mounted, and its back-to-table bar also says Live.
    await expect(
      visible(
        alex
          .getByRole("switch", { name: "High-limit table" })
          .locator("..")
          .getByText("Live", { exact: true }),
      ),
    ).toBeVisible();
    await at(alex, `/sessions/${id}`);

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
      if (kind === "Buy in" && amount === "100" && player === "Alex")
        await shoot(alex, "entry-sheet");
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
    const rebuyGus = visible(alex.getByRole("button", { name: "Rebuy $100 for Gus", exact: true }));
    await rebuyGus.click();
    await expect(
      alex.getByText("In $200 · Out $0").filter({ visible: true }).first(),
    ).toBeVisible();
    // A second tap rebuys again; the toast takes a mistaken one back.
    await rebuyGus.click();
    await expect(
      alex.getByText("In $300 · Out $0").filter({ visible: true }).first(),
    ).toBeVisible();
    await shoot(alex, "rebuy-undo");
    await visible(alex.getByRole("button", { name: "Undo", exact: true })).click();
    await expect(alex.getByText("Voided by Alex: Undone").filter({ visible: true })).toBeVisible();
    await expect(
      alex.getByText("In $200 · Out $0").filter({ visible: true }).first(),
    ).toBeVisible();

    // The places stay in reach at the table, and the table stays in reach from every place: the
    // board counts only closed sessions, and the live bar goes back to the table.
    const backToTable = () =>
      visible(alex.getByRole("button", { name: /^Back to your table at Wynn test/ })).click();
    await place(alex, "Board").click();
    await expect(
      alex.getByText("Close a session to put it on the board.").filter({ visible: true }),
    ).toBeVisible();
    await shoot(alex, "board-live");
    await backToTable();

    await visible(alex.getByRole("button", { name: "Close session" })).click();
    await visible(alex.getByRole("button", { name: "Close session" }))
      .last()
      .click();
    await expect(
      alex
        .getByText("Enter what each of them cashed out, 0 if they busted.")
        .filter({ visible: true }),
    ).toBeVisible();
    await visible(alex.getByRole("button", { name: "Keep playing" })).click();

    await record("Cash out", "Alex", "320");
    await record("Cash out", "Gus", "220", "Alex");
    // Bea busted: Bust fills $0, so no keypad.
    await visible(alex.getByRole("button", { name: /^Bea, / })).click();
    await visible(alex.getByRole("button", { name: "Bust · $0" })).click();
    await visible(alex.getByRole("button", { name: "Record cash out" })).click();
    await expect(alex.getByText("+$170").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("-$200").filter({ visible: true })).toBeVisible();
    await shoot(alex, "session-live");

    // Away from the table it's still one tap back.
    await place(alex, "Settle up").click();
    await backToTable();
    await expect(visible(alex.getByRole("button", { name: "Close session" }))).toBeVisible();

    await visible(alex.getByRole("button", { name: "Close session" })).click();
    await visible(alex.getByRole("button", { name: "Close session" }))
      .last()
      .click();
    // The closed table stays on screen with everyone's result, beside the way to the next one.
    await expect(alex.getByText("Closed", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(
      visible(alex.getByRole("button", { name: "Start another session" })),
    ).toBeVisible();
    await expect(alex.getByText("-$200").filter({ visible: true }).first()).toBeVisible();

    // The trip's board ranks the night, with the numbers of whoever's picked under it.
    await visible(alex.getByRole("button", { name: "See the board" })).click();
    await at(alex, `${tripPath}/board`);
    await expect(visible(alex.getByLabel(/^1\. Alex, you: \+\$170/))).toBeVisible();
    await expect(
      alex.getByText("Alex · #1 of 3 · 1 session").filter({ visible: true }),
    ).toBeVisible();
    await visible(alex.getByRole("button", { name: /^3\. Bea: / })).click();
    await expect(
      alex.getByText("Bea · #3 of 3 · 1 session").filter({ visible: true }),
    ).toBeVisible();
    await expect(alex.getByText("Biggest hit").filter({ visible: true }).first()).toBeVisible();
    // The trip's numbers: one table where some won and some lost, so no team run yet.
    await expect(alex.getByText("0W · 0L · 1 mixed").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("Largest drawdown").filter({ visible: true })).toBeVisible();
    await shoot(alex, "trip-board");

    // What's only yours sits behind your chip, on every screen.
    await visible(alex.getByRole("button", { name: "You", exact: true })).click();
    await expect(alex.getByText("Play limits").filter({ visible: true })).toBeVisible();
    await expect(visible(alex.getByRole("radiogroup", { name: "Appearance" }))).toBeVisible();
    await expect(visible(alex.getByRole("button", { name: "Sign out" }))).toBeVisible();
    await shoot(alex, "you");
    await visible(alex.getByRole("button", { name: "Close", exact: true })).click();

    // Alex owes Bea $50 for the buy-in and Gus $220 for the cash he kept.
    await place(alex, "Settle up").click();
    const settlePath = await at(alex, `${tripPath}/settle`);
    await expect(alex.getByText("Owes $270").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("Owed $50").filter({ visible: true })).toBeVisible();
    await expect(alex.getByText("Owed $220").filter({ visible: true })).toBeVisible();
    await expect(visible(alex.getByRole("button", { name: "Mark paid" }))).toHaveCount(2);
    await shoot(alex, "settle-up");
    for (let i = 0; i < 2; i++) {
      await visible(alex.getByRole("button", { name: "Mark paid" }))
        .first()
        .click();
      await visible(alex.getByRole("button", { name: "Record payment" })).click();
    }
    await expect(alex.getByText("Everyone's square").filter({ visible: true })).toBeVisible();

    // Settle up has its own address, so a link opens straight on it, for Bea too.
    await bea.goto(settlePath);
    await expect(bea.getByText("Square", { exact: true }).filter({ visible: true })).toHaveCount(3);

    // The Board's All time races every trip; the stat sheet opens on you, anyone else a tap away.
    await place(alex, "Board").click();
    await visible(alex.getByRole("radio", { name: "All time" })).click();
    await at(alex, `${tripPath}/board\\?scope=all`);
    await expect(
      alex.getByText("All time with Vegas crew").filter({ visible: true }),
    ).toBeVisible();
    await expect(alex.getByText(/leads by/).filter({ visible: true })).toBeVisible();
    await expect(
      alex.getByText("Alex · #1 of 3 · 1 session").filter({ visible: true }),
    ).toBeVisible();
    await visible(alex.getByRole("button", { name: /^3\. Bea: / })).click();
    await expect(
      alex.getByText("Bea · #3 of 3 · 1 session").filter({ visible: true }),
    ).toBeVisible();
    await expect(alex.getByText("Craps").filter({ visible: true }).first()).toBeVisible();
    await shoot(alex, "all-time");
    // Old addresses still land: a group's Stats on All time, a trip's Results on This trip.
    await alex.goto(`${groupPath}/stats`);
    await expect(
      alex.getByText("All time with Vegas crew").filter({ visible: true }),
    ).toBeVisible();
    await alex.goto(`${tripPath}/results`);
    await expect(visible(alex.getByLabel(/^1\. Alex, you: \+\$170/))).toBeVisible();

    // The group hub lists the trip; its settings are pushed from it, at their own address.
    await place(alex, "Group").click();
    await at(alex, groupPath);
    await expect(
      visible(alex.getByRole("button", { name: /^Vegas weekend, going/ })),
    ).toBeVisible();
    await shoot(alex, "group");
    await visible(alex.getByRole("button", { name: /^Group settings/ })).click();
    await at(alex, `${groupPath}/settings`);
    await expect(visible(alex.getByRole("button", { name: "Export CSV" }))).toBeVisible();

    // The trip ends from its Sessions, which lands on Settle up, and reopens.
    await place(alex, "Sessions").click();
    await visible(alex.getByRole("button", { name: "Trip options" })).click();
    await visible(alex.getByRole("button", { name: "End trip" })).click();
    await expect(visible(alex.getByRole("heading", { name: "Settle up" }))).toBeVisible();
    await place(alex, "Sessions").click();
    await expect(
      alex.getByText("This trip has ended. Reopen it to play more.").filter({ visible: true }),
    ).toBeVisible();
    await visible(alex.getByRole("button", { name: "Reopen trip" })).click();
    await expect(visible(alex.getByRole("button", { name: "Start a session" }))).toBeVisible();

    // A new trip starts from the scope sheet and comes into scope; one with nothing in it can be
    // deleted, and the scope goes back to the trip that's left.
    await scope(alex, "Vegas crew, Vegas weekend").click();
    await shoot(alex, "scope-sheet");
    await visible(alex.getByRole("button", { name: "New trip" })).click();
    await visible(alex.getByLabel("Trip name")).fill("Maybe Reno");
    await visible(alex.getByRole("button", { name: "Start trip" })).click();
    await expect(scope(alex, "Vegas crew, Maybe Reno")).toBeVisible();
    await expect(
      alex.getByText("No sessions on this trip yet").filter({ visible: true }),
    ).toBeVisible();
    await visible(alex.getByRole("button", { name: "Trip options" })).click();
    await visible(alex.getByRole("button", { name: "Delete trip" })).click();
    await visible(alex.getByRole("button", { name: "Delete for good" })).click();
    await expect(scope(alex, "Vegas crew, Vegas weekend")).toBeVisible();
  });
});
