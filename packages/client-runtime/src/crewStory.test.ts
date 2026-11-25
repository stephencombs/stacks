import { PlayerId } from "@stacks/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { finishedStory, liveStory, relativeWhen, storyText } from "./crewStory.ts";

const id = (n: number) => PlayerId.make(`0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`);

const me = id(1);

const player = (n: number, displayName: string, net: number) => ({
  playerId: id(n),
  displayName,
  net,
});

const show = { venue: "Fontainebleau", me: undefined, hidden: false };
const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

const at = " at Fontainebleau";

const said = (before: string, value: number, tone: "win" | "loss", after = at) => ({
  before,
  amount: { value, tone },
  after,
});

const plain = (before: string) => ({ before, amount: null, after: "" });

it("names the one big winner and shows the rest of the table", () => {
  const story = finishedStory(
    [
      player(2, "Brad", 300_000),
      player(3, "Bruce", 9_000_000),
      player(1, "Ana", 1_900_000),
      player(4, "Nick", 900_000),
    ],
    { ...show, me },
  );

  expect(story.headline).toEqual(said("Bruce won ", 9_000_000, "win"));
  expect(story.lead).toEqual({
    key: id(3),
    playerId: id(3),
    displayName: "Bruce",
    you: false,
  });
  expect(story.rest.map((result) => [result.displayName, result.net, result.you])).toEqual([
    ["Ana", 1_900_000, true],
    ["Nick", 900_000, false],
    ["Brad", 300_000, false],
  ]);
  expect(story.more).toBe(0);
});

it("says You when you are the standout", () => {
  const story = finishedStory([player(1, "Ana", 1_900_000), player(3, "Bruce", 900_000)], {
    ...show,
    me,
  });

  expect(story.headline).toEqual(said("You won ", 1_900_000, "win"));
  expect(story.lead?.you).toBe(true);
});

it("lets a winner who beat a loser show the loser in the rest", () => {
  const story = finishedStory([player(2, "Brad", -500_000), player(3, "Bruce", 100_000)], show);

  expect(story.headline).toEqual(said("Bruce won ", 100_000, "win"));
  expect(story.rest.map((result) => result.net)).toEqual([-500_000]);
});

it("doesn't pick between players who tied for the top", () => {
  const story = finishedStory(
    [player(2, "Brad", 500_000), player(3, "Bruce", 500_000), player(4, "Nick", -200_000)],
    show,
  );

  expect(story.headline).toEqual(said("Brad and Bruce each won ", 500_000, "win"));
  expect(story.rest.map((result) => result.displayName)).toEqual(["Nick"]);
});

it("counts a tie of many instead of listing it", () => {
  const story = finishedStory(
    [player(2, "A", 100), player(3, "B", 100), player(4, "C", 100), player(5, "D", 100)],
    show,
  );

  expect(story.headline.before).toBe("A, B and 2 others each won ");
});

it("tells two players with the same name apart", () => {
  const story = finishedStory(
    [
      { playerId: null, displayName: "Guest", net: 100 },
      { playerId: null, displayName: "Guest", net: 100 },
    ],
    show,
  );

  expect(story.headline.before).toBe("Guest and Guest 2 each won ");
});

it("calls a table where everyone lost a rough night, with the whole table's loss", () => {
  const story = finishedStory(
    [player(2, "Brad", -100_000), player(3, "Bruce", -400_000), player(4, "Nick", -250_000)],
    show,
  );

  expect(story.headline).toEqual(
    said("Rough night at Fontainebleau: the table lost ", 750_000, "loss", ""),
  );
  expect(story.lead).toBeNull();
  expect(story.rest.map((result) => result.displayName)).toEqual(["Bruce", "Nick", "Brad"]);
});

it("keeps a rough night to losses and evens, never a winner", () => {
  const story = finishedStory(
    [player(2, "Brad", 0), player(3, "Bruce", -400_000), player(4, "Nick", -250_000)],
    show,
  );

  expect(story.headline.before).toBe("Rough night at Fontainebleau: the table lost ");
  expect(story.rest.map((result) => result.net)).toEqual([-400_000, -250_000, 0]);
});

it("doesn't call it a rough night when only one person lost", () => {
  const story = finishedStory([player(2, "Brad", 0), player(3, "Bruce", -400_000)], show);

  expect(story.headline).toEqual(said("Bruce lost ", 400_000, "loss"));
  expect(story.lead?.displayName).toBe("Bruce");
  expect(story.rest).toEqual([]);
});

it("says a solo loss as a loss, not a night", () => {
  const story = finishedStory([player(1, "Ana", -400_000)], { ...show, me });

  expect(story.headline).toEqual(said("You lost ", 400_000, "loss"));
});

it("gives a table where everyone is at zero one quiet line", () => {
  const story = finishedStory([player(2, "Brad", 0), player(3, "Bruce", 0)], show);

  expect(story).toEqual({
    headline: plain("Everyone broke even at Fontainebleau"),
    lead: null,
    rest: [],
    more: 0,
  });
});

it("gives one player who broke even their own quiet line", () => {
  const story = finishedStory([player(1, "Ana", 0)], { ...show, me });

  expect(story.headline).toEqual(plain("You broke even at Fontainebleau"));
  expect(story.lead?.displayName).toBe("Ana");
  expect(story.rest).toEqual([]);
});

it("gives one person up with everyone else flat a quiet line and no faces", () => {
  const story = finishedStory(
    [player(2, "Brad", 0), player(3, "Bruce", 120_000), player(4, "Nick", 0)],
    show,
  );

  expect(story.headline).toEqual(said("Bruce won ", 120_000, "win"));
  expect(story.rest).toEqual([]);
  expect(story.more).toBe(0);
});

it("keeps flat players beside the standout when anyone else had a result", () => {
  const story = finishedStory(
    [player(2, "Brad", 0), player(3, "Bruce", 120_000), player(4, "Nick", -50_000)],
    show,
  );

  expect(story.rest.map((result) => result.net)).toEqual([0, -50_000]);
});

it("shows the top few faces of a big table and counts the rest", () => {
  const story = finishedStory(
    [
      player(2, "A", 800),
      player(3, "B", 700),
      player(4, "C", 600),
      player(5, "D", 500),
      player(6, "E", 400),
      player(7, "F", 300),
      player(8, "G", 200),
      player(9, "H", 100),
    ],
    show,
  );

  expect(story.lead?.displayName).toBe("A");
  expect(story.rest.map((result) => result.displayName)).toEqual(["B", "C", "D", "E"]);
  expect(story.more).toBe(3);
});

it("never says +1: one face too many just shows", () => {
  const six = finishedStory(
    [
      player(2, "A", 600),
      player(3, "B", 500),
      player(4, "C", 400),
      player(5, "D", 300),
      player(6, "E", 200),
      player(7, "F", 100),
    ],
    show,
  );

  expect(six.rest).toHaveLength(5);
  expect(six.more).toBe(0);
});

it("lets a guest at a table have no player id, and keys them by seat", () => {
  const story = finishedStory(
    [
      { playerId: null, displayName: "Dave", net: 5_000 },
      { playerId: null, displayName: "Dave", net: -2_000 },
      player(1, "Ana", -1_000),
    ],
    { ...show, me },
  );

  expect(story.lead).toEqual({ key: "guest-0", playerId: null, displayName: "Dave", you: false });
  expect(story.rest.map((result) => result.key)).toEqual([id(1), "guest-1"]);
  expect(story.rest[0]?.you).toBe(true);
});

it("says no result at all while amounts are hidden", () => {
  const story = finishedStory(
    [player(2, "Bruce", 9_000_000), player(1, "Ana", -1_000), player(4, "Nick", 400)],
    { ...show, me, hidden: true },
  );

  expect(story).toEqual({
    headline: plain("Bruce, You and Nick played at Fontainebleau"),
    lead: { key: id(2), playerId: id(2), displayName: "Bruce", you: false },
    rest: [],
    more: 0,
  });
});

it("says where a table with no casino was played", () => {
  const story = finishedStory([player(2, "Bruce", 100)], { ...show, venue: "a table" });

  expect(story.headline.after).toBe(" at a table");
});

it("finishes an empty table without a name", () => {
  expect(finishedStory([], show).headline).toEqual(plain("Finished at Fontainebleau"));
});

it("reads out the headline and each result for a screen reader", () => {
  const story = finishedStory(
    [
      player(2, "Bruce", 9_000_000),
      player(1, "Ana", 1_900_000),
      player(4, "Nick", -300_000),
      player(5, "Di", 0),
    ],
    { ...show, me },
  );

  expect(storyText(story, dollars)).toBe(
    "Bruce won $90,000 at Fontainebleau. You won $19,000, Di broke even, Nick lost $3,000",
  );
});

it("reads out how many more there were", () => {
  const story = finishedStory(
    Array.from({ length: 9 }, (_, i) => player(i + 2, `P${i}`, 900 - i * 100)),
    show,
  );

  expect(storyText(story, dollars)).toMatch(/, 4 more$/);
});

it("reads out a headline with no amount as it is", () => {
  expect(
    storyText(finishedStory([player(2, "Bruce", 100)], { ...show, hidden: true }), dollars),
  ).toBe("Bruce played at Fontainebleau");
});

it("says who is playing, counting past two names", () => {
  const live = (
    names: ReadonlyArray<string>,
    game: Parameters<typeof liveStory>[1]["game"] = null,
  ) =>
    liveStory(
      names.map((displayName, i) => ({ playerId: id(i + 2), displayName })),
      { venue: "Caesars Palace", game, me },
    ).headline;

  expect(live(["Bruce"])).toBe("Bruce is playing at Caesars Palace");
  expect(live(["Bruce", "Nick"])).toBe("Bruce and Nick are playing at Caesars Palace");
  expect(live(["Bruce", "Nick", "Brad", "Di"])).toBe(
    "Bruce, Nick and 2 others are playing at Caesars Palace",
  );
  expect(live(["Bruce"], "blackjack")).toBe("Bruce is playing blackjack at Caesars Palace");
  expect(live(["Bruce"], "poker_tourney")).toBe(
    "Bruce is playing a poker tournament at Caesars Palace",
  );
  expect(live(["Bruce"], "other")).toBe("Bruce is playing at Caesars Palace");
  expect(live([])).toBe("Someone is playing at Caesars Palace");
});

it("leads a live post with the first player and says You for yourself", () => {
  const story = liveStory([{ playerId: me, displayName: "Ana" }], {
    venue: "Bellagio",
    game: null,
    me,
  });

  expect(story.headline).toBe("You are playing at Bellagio");
  expect(story.lead).toEqual({ key: me, playerId: me, displayName: "Ana", you: true });
});

const utc = DateTime.zoneMakeNamedUnsafe("UTC");
const moment = (iso: string) => DateTime.makeUnsafe(iso);
const when = (at: string, now: string, zone = utc) => relativeWhen(moment(at), moment(now), zone);

it("says how long ago, in minutes then hours", () => {
  const now = "2026-11-12T15:00:00Z";

  expect(when("2026-11-12T15:00:00Z", now)).toBe("Just now");
  expect(when("2026-11-12T14:59:30Z", now)).toBe("Just now");
  expect(when("2026-11-12T14:59:00Z", now)).toBe("1m ago");
  expect(when("2026-11-12T14:01:00Z", now)).toBe("59m ago");
  expect(when("2026-11-12T14:00:00Z", now)).toBe("1h ago");
  expect(when("2026-11-12T13:00:00Z", now)).toBe("2h ago");
  expect(when("2026-11-12T02:00:00Z", now)).toBe("13h ago");
});

it("doesn't read a time in the future as ago", () => {
  expect(when("2026-11-12T15:05:00Z", "2026-11-12T15:00:00Z")).toBe("Just now");
});

it("keeps counting hours across midnight until half a day has passed", () => {
  expect(when("2026-11-11T23:30:00Z", "2026-11-12T01:00:00Z")).toBe("1h ago");
  expect(when("2026-11-11T23:30:00Z", "2026-11-12T11:00:00Z")).toBe("11h ago");
});

it("says Yesterday, then the weekday for the rest of the week", () => {
  const now = "2026-11-12T15:00:00Z";

  expect(when("2026-11-11T09:00:00Z", now)).toBe("Yesterday");
  expect(when("2026-11-10T22:00:00Z", now)).toBe("Tue");
  expect(when("2026-11-09T01:00:00Z", now)).toBe("Mon");
  expect(when("2026-11-06T12:00:00Z", now)).toBe("Fri");
});

it("falls back to the date a week out, and adds the year when it isn't this one", () => {
  const now = "2026-11-12T15:00:00Z";

  expect(when("2026-11-05T12:00:00Z", now)).toBe("Nov 5");
  expect(when("2026-03-01T12:00:00Z", now)).toBe("Mar 1");
  expect(when("2025-12-31T12:00:00Z", now)).toBe("Dec 31, 2025");
});

it("counts days where the viewer is, not in UTC", () => {
  const newYork = DateTime.zoneMakeNamedUnsafe("America/New_York");
  const at = "2026-11-12T03:00:00Z";
  const now = "2026-11-12T20:00:00Z";

  expect(when(at, now, utc)).toBe("17h ago");
  expect(when(at, now, newYork)).toBe("Yesterday");
});
