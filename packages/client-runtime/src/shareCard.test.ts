import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import { CurrencyCode, MinorUnits, PlayerId, SessionId, VenueId } from "@stacks/contracts";
import type { TripSession } from "@stacks/shared/trips";

import { CARD_ROWS, cardHidden, sessionCardModel, tripCardModel } from "./shareCard.ts";
import { localClock } from "./trip.ts";

const usd = CurrencyCode.make("USD");

const player = (n: number) =>
  PlayerId.make(`0192e7a0-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`);

const night = (day: number, hour: number) =>
  DateTime.makeUnsafe(new Date(2026, 9, day, hour).getTime());

const play = (n: number, day: number, nets: ReadonlyArray<readonly [number, number]>) =>
  ({
    session: {
      id: SessionId.make(`0192e7a0-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`),
      startedAt: night(day, 20),
    },
    venue: { id: VenueId.make("0192e7a0-0000-7000-8000-000000000002") },
    results: nets.map(([id, net]) => ({
      playerId: player(id),
      buyIn: MinorUnits.make(10_000),
      net: MinorUnits.make(net),
    })),
  }) satisfies TripSession;

const crowd = Array.from({ length: 12 }, (_, i) => i + 1);

const sessions = [
  play(
    1,
    20,
    crowd.map((id) => [id, 123_400 - id * 10_000] as const),
  ),
  play(2, 21, [[1, -7_700]]),
];

const players = crowd.map((id) => ({ id: player(id), displayName: `Player ${id}` }));

const trip = (me: number, hidden: boolean, closed: ReadonlyArray<TripSession> = sessions) =>
  tripCardModel({
    name: "Vegas weekend",
    dates: "Oct 20 – Oct 21",
    venues: ["Circa", null, "Circa", "Bellagio"],
    currency: usd,
    me: player(me),
    closed,
    players,
    chip: (id) => (crowd.indexOf(Number(id.slice(-2))) % 8) + 1,
    clock: localClock,
    hidden,
  });

it("hides on privacy mode or the card's own toggle, and only then", () => {
  expect(cardHidden(false, false)).toBe(false);
  expect(cardHidden(true, false)).toBe(true);
  expect(cardHidden(false, true)).toBe(true);
  expect(cardHidden(true, true)).toBe(true);
});

it("keeps the standings to 8 rows and says how many are left out", () => {
  const model = trip(2, false);

  expect(CARD_ROWS).toBe(8);
  expect(model.rows).toHaveLength(8);
  expect(model.more).toBe(4);
  expect(model.rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});

it("always includes you, in the last row, when you finished outside the top 8", () => {
  const model = trip(11, false);

  expect(model.rows).toHaveLength(8);
  expect(model.rows.filter((row) => row.isYou)).toHaveLength(1);
  expect(model.rows.at(-1)).toMatchObject({ isYou: true, name: "Player 11", rank: 11 });
  expect(model.rows.slice(0, 7).map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(model.more).toBe(4);
});

it("shows everyone, with no more line, when 8 or fewer played", () => {
  const small = [
    play(3, 20, [
      [1, 500],
      [2, -500],
    ]),
  ];

  const model = trip(2, false, small);

  expect(model.rows.map((row) => row.name)).toEqual(["Player 1", "Player 2"]);
  expect(model.more).toBe(0);
});

it("has no you when you didn't play", () => {
  const model = trip(12, false, [
    play(3, 20, [
      [1, 500],
      [2, -500],
    ]),
  ]);

  expect(model.you).toBeNull();
  expect(model.rows.some((row) => row.isYou)).toBe(false);
});

it("lists each venue once, and counts the nights and sessions you played", () => {
  const model = trip(1, false);

  expect(model.venues).toEqual(["Circa", "Bellagio"]);
  expect(model.you).toMatchObject({ rank: 1, sessions: 2, nights: 2 });
  expect(model.you?.amounts?.line).toEqual([0, 113_400, 105_700]);
  expect(model.you?.amounts?.net).toBe(105_700);
});

it("drops every amount, the climb copy and the line when hidden", () => {
  const model = trip(1, true);

  expect(model.hidden).toBe(true);
  expect(model.rows.every((row) => row.net === null)).toBe(true);
  expect(model.you?.amounts).toBeNull();
  expect(model.rows.map((row) => [row.rank, row.name])).toEqual(
    trip(1, false).rows.map((row) => [row.rank, row.name]),
  );
  expect(model.you).toMatchObject({ rank: 1, sessions: 2, nights: 2 });
  expect(JSON.stringify(model)).not.toMatch(/105700|113400|climb|"line"/);
});

it("says how far you climbed from your low, unhidden", () => {
  const model = trip(1, false, [play(4, 20, [[1, -20_000]]), play(5, 21, [[1, 50_000]])]);

  expect(model.you?.amounts?.climb).toBe("Up $500 from your low");
});

const sessionCard = (hidden: boolean) =>
  sessionCardModel({
    venue: "Circa",
    game: "Blackjack",
    startedAt: night(24, 20),
    finishedAt: night(24, 23),
    currency: usd,
    result: MinorUnits.make(41_150),
    buyIn: MinorUnits.make(30_000),
    cashOut: MinorUnits.make(71_150),
    hourly: 13_716,
    hidden,
  });

it("a session card carries venue, game, date, duration and its amounts", () => {
  const model = sessionCard(false);

  expect(model).toMatchObject({ venue: "Circa", game: "Blackjack", duration: "3h 00m" });
  expect(model.amounts).toEqual({
    result: 41_150,
    buyIn: 30_000,
    cashOut: 71_150,
    hourly: 13_716,
  });
});

it("a hidden session card keeps the venue, game, date and duration and nothing else", () => {
  const model = sessionCard(true);

  expect(model.amounts).toBeNull();
  expect(model).toMatchObject({ venue: "Circa", game: "Blackjack", duration: "3h 00m" });
  expect(JSON.stringify(model)).not.toMatch(/41150|30000|71150|13716/);
});

it("a session too short for an hourly result has none, even unhidden", () => {
  expect(
    sessionCardModel({
      venue: null,
      game: "Slots",
      startedAt: night(24, 20),
      finishedAt: night(24, 20),
      currency: usd,
      result: MinorUnits.make(0),
      buyIn: MinorUnits.make(0),
      cashOut: MinorUnits.make(0),
      hourly: null,
      hidden: false,
    }).amounts?.hourly,
  ).toBeNull();
});
