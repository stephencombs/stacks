import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  SessionId,
  TripId,
  UserId,
  VenueId,
} from "@stacks/contracts";

import {
  awardLine,
  balanceHeadline,
  boardMoney,
  localClock,
  makeLastTripStore,
  ordinal,
  raceHeadline,
  recordLine,
  resolveEntry,
  streakLine,
  tripLines,
  unsettledAmount,
} from "./trip.ts";

const usd = CurrencyCode.make("USD");
const local = (day: number, hour: number) =>
  DateTime.makeUnsafe(new Date(2026, 9, day, hour).getTime());

it("counts the small hours toward the night before", () => {
  expect(localClock.night(local(23, 22))).toBe("2026-10-23");
  expect(localClock.night(local(24, 3))).toBe("2026-10-23");
  expect(localClock.night(local(24, 7))).toBe("2026-10-24");
  expect(localClock.hour(local(24, 3))).toBe(3);
});

it("shows board money signed, without cents when there are none", () => {
  expect(boardMoney(4115000, usd)).toBe("+$41,150");
  expect(boardMoney(-48050, usd)).toBe("-$480.50");
  expect(boardMoney(100000, usd, false)).toBe("$1,000");
});

it("says what earned each award", () => {
  const session = {
    session: {
      id: SessionId.make("0192e7a0-0000-7000-8000-000000000001"),
      startedAt: local(24, 2),
    },
    venue: { id: VenueId.make("0192e7a0-0000-7000-8000-000000000002"), name: "Circa" },
    results: [],
  };
  const award = { playerId: undefined as never, session };
  expect(awardLine({ ...award, key: "biggest_hit", value: 790000 }, usd)).toBe("+$7,900 at Circa");
  expect(awardLine({ ...award, key: "rough_night", value: 50000 }, usd)).toBe("-$500 at Circa");
  expect(awardLine({ ...award, key: "heater", value: 8, session: null }, usd)).toBe(
    "8 winning sessions in a row",
  );
  expect(awardLine({ ...award, key: "night_owl", value: 2 }, usd)).toMatch(/^Sat down at 2:00/);
});

it("puts runs and records into words", () => {
  expect(streakLine({ length: 1, winning: true })).toBeNull();
  expect(streakLine({ length: 8, winning: true })).toBe("8 wins in a row");
  expect(streakLine({ length: 2, winning: false })).toBe("2 losses in a row");
  expect(recordLine(4, 3, 0)).toBe("4W · 3L");
  expect(recordLine(8, 2, 1)).toBe("8W · 2L · 1 even");
  expect(recordLine(0, 0, 2)).toBe("2 even");
});

it("resolves app entry from the last-viewed trip and going trips across groups", () => {
  const user = UserId.make("user_1");
  const makeGroup = (id: string, name: string) => ({
    id: GroupId.make(id),
    name,
    currency: usd,
    createdAt: local(1, 12),
  });
  const makeTrip = (
    id: string,
    groupId: GroupId,
    name: string,
    startedDay: number,
    ended: boolean,
  ) => ({
    id: TripId.make(id),
    groupId,
    name,
    startedAt: local(startedDay, 12),
    createdAt: local(startedDay, 12),
    endedAt: ended ? local(startedDay + 2, 12) : null,
    createdBy: user,
  });

  const vegasGroup = makeGroup("0192e7a0-0000-7000-8000-000000000010", "Vegas crew");
  const homeGroup = makeGroup("0192e7a0-0000-7000-8000-000000000011", "Home game");
  const pastTrip = makeTrip(
    "0192e7a0-0000-7000-8000-000000000020",
    vegasGroup.id,
    "Spring",
    10,
    true,
  );
  const vegasTrip = makeTrip(
    "0192e7a0-0000-7000-8000-000000000021",
    vegasGroup.id,
    "Fall Vegas",
    20,
    false,
  );
  const homeTrip = makeTrip(
    "0192e7a0-0000-7000-8000-000000000022",
    homeGroup.id,
    "October",
    22,
    false,
  );
  const missingTripId = TripId.make("0192e7a0-0000-7000-8000-000000000099");

  expect(resolveEntry([], null)).toEqual({ kind: "groups" });
  expect(resolveEntry([{ group: vegasGroup, trips: [pastTrip] }], null)).toEqual({
    kind: "groups",
  });

  expect(resolveEntry([{ group: vegasGroup, trips: [vegasTrip, pastTrip] }], null)).toEqual({
    kind: "trip",
    tripId: vegasTrip.id,
  });

  const multiple = [
    { group: vegasGroup, trips: [vegasTrip, pastTrip] },
    { group: homeGroup, trips: [homeTrip] },
  ];
  expect(resolveEntry(multiple, null)).toEqual({
    kind: "choose",
    trips: [
      { group: homeGroup, trip: homeTrip },
      { group: vegasGroup, trip: vegasTrip },
    ],
  });

  expect(resolveEntry(multiple, pastTrip.id)).toEqual({
    kind: "trip",
    tripId: pastTrip.id,
  });

  expect(resolveEntry(multiple, missingTripId)).toEqual({
    kind: "choose",
    trips: [
      { group: homeGroup, trip: homeTrip },
      { group: vegasGroup, trip: vegasTrip },
    ],
  });
});

it("persists and notifies on last-viewed trip changes", () => {
  let saved: string | null = "0192e7a0-0000-7000-8000-000000000021";
  let notifications = 0;
  const store = makeLastTripStore({
    load: () => saved,
    save: (next) => {
      saved = next;
    },
  });
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  const first = TripId.make("0192e7a0-0000-7000-8000-000000000021");
  const second = TripId.make("0192e7a0-0000-7000-8000-000000000022");
  expect(store.get()).toBe(first);
  store.set(first);
  expect(notifications).toBe(0);
  store.set(second);
  expect(store.get()).toBe(second);
  expect(saved).toBe(second);
  expect(notifications).toBe(1);
  store.set(null);
  expect(store.get()).toBeNull();
  expect(saved).toBeNull();
  expect(notifications).toBe(2);
  unsubscribe();
  store.set(first);
  expect(notifications).toBe(2);

  expect(
    unsettledAmount({ unsettled: [{ tripId: second, amount: MinorUnits.make(4500) }] }, second),
  ).toBe(4500);
  expect(unsettledAmount({ unsettled: [] }, second)).toBeNull();
});

it("names places on the board", () => {
  expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
    "1st",
    "2nd",
    "3rd",
    "4th",
    "11th",
    "12th",
    "13th",
    "21st",
    "22nd",
    "101st",
  ]);
});

it("says how far a trip climbed from its low, and how often it won", () => {
  const trip = {
    net: 27500,
    line: [0, -12500, -6500, 27500],
    played: 3,
    won: 2,
    low: -12500,
    best: null,
  };
  expect(tripLines(trip, usd)).toEqual({ climb: "Up $400 from your low", winRate: "67%" });
  expect(tripLines({ ...trip, low: 0 }, usd).climb).toBeNull();
  expect(tripLines({ ...trip, net: -12500 }, usd).climb).toBeNull();
  expect(tripLines({ ...trip, played: 0, won: 0 }, usd).winRate).toBe("–");
});

it("heads your balance by which way it runs and how many payments clear it", () => {
  expect(balanceHeadline(18500, 1)).toEqual({
    label: "You're owed",
    tone: "win",
    line: "One payment squares you up",
  });
  expect(balanceHeadline(-6000, 2)).toEqual({
    label: "You owe",
    tone: "loss",
    line: "2 payments square you up",
  });
  expect(balanceHeadline(0, 0)).toEqual({ label: "You're square", tone: "accent", line: null });
});

it("says where you stand on the board and the gap that matters", () => {
  const [me, priya, dev] = ["p1", "p2", "p3"] as unknown as ReadonlyArray<
    Parameters<typeof raceHeadline>[1]
  >;
  const names = new Map([
    [me!, "Maya"],
    [priya!, "Priya"],
    [dev!, "Dev"],
  ]);
  const board = [
    { playerId: dev!, net: -21000, rank: 3 },
    { playerId: me!, net: 27500, rank: 1 },
    { playerId: priya!, net: 18000, rank: 2 },
  ];
  expect(raceHeadline(board, me!, names, usd)).toEqual({
    label: "You lead",
    net: 27500,
    line: "$95 ahead of Priya",
  });
  expect(raceHeadline(board, dev!, names, usd)).toEqual({
    label: "3rd of 3",
    net: -21000,
    line: "$485 behind Maya",
  });
  expect(raceHeadline([{ playerId: me!, net: 500, rank: 1 }], me!, names, usd)?.line).toBeNull();
  expect(raceHeadline(board, "nobody" as never, names, usd)).toBeNull();
});
