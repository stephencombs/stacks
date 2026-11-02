import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { createUsers, deleteUsers, signIn } from "./users";

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR;
const shoot = async (page: Page, name: string) => {
  if (!SCREENSHOTS) return;
  // Let the camera settle before the picture.
  await page.waitForTimeout(2600);
  await page
    .getByRole("img", { name: /^Blackjack table/ })
    .filter({ visible: true })
    .screenshot({ path: `${SCREENSHOTS}/mobile-${name}.png` });
};

/** As in the full loop: Chromium without what Hermes on iOS lacks. */
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

test.describe.serial("seats at a blackjack table on a phone", () => {
  let users: Awaited<ReturnType<typeof createUsers>> = [];
  test.beforeAll(async () => {
    users = await createUsers(["Alex"]);
  });
  test.afterAll(async () => {
    await deleteUsers(users);
  });

  test("seat players, move them, and see the night on the table", async ({ browser }) => {
    test.slow();
    const page = await hermesLike(await browser.newContext(test.info().project.use)).newPage();
    const visible = (locator: Locator) => locator.filter({ visible: true });
    await signIn(page, users[0]!.emailAddress);
    await visible(page.getByRole("button", { name: "New group" })).click();
    await page.getByLabel("Group name").fill("Table crew");
    await visible(page.getByRole("button", { name: "Create group" })).click();
    await visible(page.getByRole("button", { name: "People" })).click();
    await visible(page.getByRole("button", { name: "Add a guest" })).click();
    await page.getByLabel("Name", { exact: true }).fill("Gus");
    await visible(page.getByRole("button", { name: "Add guest" })).click();
    await expect(visible(page.getByRole("button", { name: "Send claim link" }))).toBeVisible();
    await page.goBack();
    await visible(page.getByRole("button", { name: "Start a trip" })).click();
    await visible(page.getByLabel("Trip name")).fill("Seats");
    await visible(page.getByRole("button", { name: "Start trip" })).click();
    await visible(page.getByRole("button", { name: "Start a session" })).click();
    await visible(page.getByRole("button", { name: "Add a venue" })).click();
    await page.getByLabel("Name", { exact: true }).fill(`Palazzo ${Date.now().toString(36)}`);
    await page.getByLabel("City").fill("Las Vegas");
    await visible(page.getByRole("button", { name: "Add venue" })).click();
    await page.getByRole("radio", { name: "Blackjack" }).click();
    await page.getByRole("checkbox", { name: "Gus" }).click();
    await visible(page.getByRole("button", { name: "Start session" })).click();
    await expect(visible(page.getByText("Live", { exact: true }))).toBeVisible();

    const seat = (name: RegExp) => visible(page.getByRole("button", { name }));
    await expect(seat(/^Seat 5, third base, empty$/)).toBeVisible();
    await shoot(page, "table-empty");
    await page.getByRole("radio", { name: "7 seats" }).click();
    await expect(seat(/^Seat 7, third base, empty$/)).toBeVisible({ timeout: 300 });

    const sit = async (seatName: RegExp, player: string) => {
      await seat(seatName).click();
      // The sheet's rows read out the chip's initial, then the name.
      await visible(
        page.getByRole("button", { name: new RegExp(`^${player[0]} ${player}`) }),
      ).click();
    };
    await sit(/^Seat 7, third base, empty$/, "Alex");
    await expect(seat(/^Seat 7, third base, Alex$/)).toBeVisible();
    await sit(/^Seat 4, empty$/, "Gus");
    await expect(seat(/^Seat 4, Gus$/)).toBeVisible();
    await seat(/^Seat 4, Gus$/).click();
    await visible(page.getByRole("button", { name: "Move to seat 5" })).click();
    await expect(seat(/^Seat 5, Gus$/)).toBeVisible();

    const record = async (kind: "Buy in" | "Cash out", player: string, amount: string) => {
      await visible(page.getByRole("button", { name: new RegExp(`^${player}, `) })).click();
      await visible(page.getByRole("radio", { name: kind })).click();
      for (const key of amount)
        await visible(page.getByRole("button", { name: key, exact: true })).click();
      await visible(
        page.getByRole("button", { name: kind === "Buy in" ? "Record buy in" : "Record cash out" }),
      ).click();
    };
    await record("Buy in", "Alex", "300");
    await record("Buy in", "Gus", "200");
    await expect(seat(/^Seat 7, third base, Alex, \$300 in play$/)).toBeVisible();
    await expect(seat(/^Seat 5, Gus, \$200 in play$/)).toBeVisible();
    await shoot(page, "table-playing");

    await visible(page.getByRole("button", { name: /^Gus, / })).click();
    await visible(page.getByRole("button", { name: "Bust · $0" })).click();
    await expect(seat(/^Seat 5, Gus, busted$/)).toBeVisible();
    await record("Cash out", "Alex", "1100");
    await expect(seat(/^Seat 7, third base, Alex, \+\$800$/)).toBeVisible();

    await visible(page.getByRole("button", { name: "Close session" })).click();
    await visible(page.getByRole("button", { name: "Close session" }))
      .last()
      .click();
    await expect(visible(page.getByText("Closed", { exact: true }))).toBeVisible();
    await shoot(page, "table-closed");
  });
});
