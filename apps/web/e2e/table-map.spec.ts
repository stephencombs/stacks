import { expect, test, type Page } from "@playwright/test";

import { createUsers, deleteUsers, signIn } from "./users";

const SCREENSHOTS = process.env.E2E_SCREENSHOT_DIR;
const shoot = async (page: Page, name: string) => {
  if (!SCREENSHOTS) return;
  // Let the camera settle before the picture.
  await page.waitForTimeout(1800);
  const table = page.getByRole("img", { name: /^Blackjack table/ }).locator("xpath=../..");
  console.log(name, await table.locator("[data-world]").evaluate((el) => el.style.transform));
  await table.screenshot({ path: `${SCREENSHOTS}/${name}.png` });
};

test.describe.serial("seats at a blackjack table", () => {
  let users: Awaited<ReturnType<typeof createUsers>> = [];
  test.beforeAll(async () => {
    users = await createUsers(["Alex"]);
  });
  test.afterAll(async () => {
    await deleteUsers(users);
  });

  test("seat players, move them, and see the night play out on the table", async ({ browser }) => {
    test.slow();
    const page = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    ).newPage();
    await signIn(page, users[0]!.emailAddress);
    await page.getByRole("link", { name: "Groups", exact: true }).click();
    await page.getByRole("button", { name: "New group" }).click();
    await page.getByLabel("Group name").fill("Table crew");
    await page.getByRole("button", { name: "Create group" }).click();
    await page.getByRole("link", { name: /^1 member/ }).click();
    await page.getByRole("button", { name: "Add a guest" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Gus");
    await page.getByRole("button", { name: "Add guest" }).click();
    await expect(page.getByRole("button", { name: "Copy claim link" })).toBeVisible();
    // The group's first trip opens straight onto its first session.
    await page.getByRole("link", { name: "Table crew" }).click();
    await page.getByLabel("Trip name").fill("Seats");
    await page.getByRole("button", { name: "Start trip" }).click();
    await page.getByRole("button", { name: "Add a venue" }).click();
    await page.getByLabel("Name", { exact: true }).fill(`Palazzo ${Date.now().toString(36)}`);
    await page.getByLabel("City").fill("Las Vegas");
    await page.getByRole("button", { name: "Add venue" }).click();
    await page.getByText("Blackjack", { exact: true }).click();
    await page.getByRole("checkbox", { name: /Gus/ }).check();
    // Those frames are also Vite "?url" imports. Aborting the scripts fails the session route.
    await page.route(/\/frame-5-\d+\.webp/, (route) =>
      route.request().resourceType() === "image" ? route.abort() : route.continue(),
    );
    await page.getByRole("button", { name: "Start session" }).click();
    await expect(page.getByRole("main").getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByText("Couldn't load the table artwork.")).toBeVisible();
    await page.unroute(/\/frame-5-\d+\.webp/);
    await page.getByRole("button", { name: "Retry table artwork" }).click();
    // Anyone can mark the table high limit.
    const highLimit = page.getByRole("checkbox", { name: "High limit" });
    await highLimit.click();
    await expect(highLimit).toBeChecked();

    // An empty table, five seats unless someone picks another size: every seat is open.
    const seat = (name: RegExp) => page.getByRole("button", { name });
    await expect(seat(/^Seat 5, third base, empty$/)).toBeVisible();
    await shoot(page, "table-empty");

    // The table comes in 5, 6 or 7 seats; the last is always third base.
    const size = page.getByRole("button", { name: /^Table size: / });
    const pickSize = async (seats: number) => {
      await size.click();
      await page.getByRole("menuitemradio", { name: `${seats} seats` }).click();
      // A choice stays open for another pick, like the theme menu.
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toBeHidden();
    };
    // The other sizes are preloaded, so the table itself swaps at once too.
    await pickSize(6);
    await expect(seat(/^Seat 6, third base, empty$/)).toBeVisible({ timeout: 300 });
    await expect(seat(/^Seat 7/)).toHaveCount(0);
    // The pick shows at once, before the server answers.
    await pickSize(7);
    await expect(size).toHaveAccessibleName("Table size: 7 seats", { timeout: 200 });
    await expect(seat(/^Seat 7, third base, empty$/)).toBeVisible();

    const sit = async (seatName: RegExp, player: string) => {
      await seat(seatName).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(`^.?${player}`) })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden();
    };
    await sit(/^Seat 7, third base, empty$/, "Alex");
    await sit(/^Seat 4, empty$/, "Gus");
    await expect(seat(/^Seat 7, third base, Alex$/)).toBeVisible();
    await expect(seat(/^Seat 4, Gus$/)).toBeVisible();

    // Quick picks: the answer to the first can't undo the second while it's on its way.
    await pickSize(6);
    await pickSize(7);
    const picks = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const seen: string[] = [];
          const t0 = performance.now();
          const tick = () => {
            seen.push(
              document.querySelector('[aria-label^="Table size: "]')?.getAttribute("aria-label") ??
                "",
            );
            if (performance.now() - t0 < 2000) setTimeout(tick, 20);
            else resolve(seen);
          };
          tick();
        }),
    );
    expect(new Set(picks)).toEqual(new Set(["Table size: 7 seats"]));

    // A table can't shrink out from under someone.
    await pickSize(5);
    await expect(page.getByText("Move whoever's in seat 7 first.")).toBeVisible();

    // Gus moves down a seat; the old one opens up.
    await seat(/^Seat 4, Gus$/).click();
    await page.getByRole("dialog").getByRole("button", { name: "Move to seat 5" }).click();
    await expect(seat(/^Seat 5, Gus$/)).toBeVisible();
    await expect(seat(/^Seat 4, empty$/)).toBeVisible();

    // Buy-ins stack chips in front of each seat.
    const record = async (kind: "Buy in" | "Cash out", player: string, amount: string) => {
      await page.getByRole("button", { name: new RegExp(`^${player}, `) }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText(kind, { exact: true }).click();
      await dialog.getByLabel("Amount").fill(amount);
      await dialog
        .getByRole("button", { name: kind === "Buy in" ? "Record buy in" : "Record cash out" })
        .click();
      await expect(dialog).toBeHidden();
    };
    await record("Buy in", "Alex", "300");
    await record("Buy in", "Gus", "200");
    await expect(seat(/^Seat 7, third base, Alex, \$300 in play$/)).toBeVisible();
    await expect(seat(/^Seat 5, Gus, \$200 in play$/)).toBeVisible();
    await shoot(page, "table-playing");

    // Gus busts; Alex cashes out big. Each leaves a result on the felt.
    await page.getByRole("button", { name: /^Gus, / }).click();
    await page.getByRole("button", { name: "Bust · $0" }).click();
    await page.getByRole("button", { name: "Record cash out" }).click();
    await expect(seat(/^Seat 5, Gus, busted$/)).toBeVisible();
    // Alex is still playing when the table closes: the close takes his cash-out with it, in one
    // request rather than one per player.
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/sessions/"))
        writes.push(new URL(request.url()).pathname.split("/").at(-1)!);
    });
    await page.getByRole("button", { name: "Close session" }).click();
    const closing = page.getByRole("dialog");
    await closing.getByLabel("Alex").fill("1100");
    await closing.getByRole("button", { name: "Close session" }).click();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    expect(writes).toEqual(["close"]);
    // Seats freeze once the session is closed.
    await expect(seat(/^Seat 7, third base, Alex, \+\$800$/)).toBeDisabled();
    await shoot(page, "table-closed");
  });
});
