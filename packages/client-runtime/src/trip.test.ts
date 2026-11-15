import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  SessionId,
  TableId,
  TripId,
  UserId,
  VenueId,
  type SessionSummary,
  type TripTable,
} from "@stacks/contracts";

import {
  awardLine,
  boardMoney,
  localClock,
  makeLastTripStore,
  ordinal,
  raceHeadline,
  recordLine,
  resolveEntry,
  returnLabel,
  scopeTrips,
  streakLine,
  tripInScope,
  tripLines,
  tripNames,
  tripPlays,
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

it("leaves the place off an award for a table with no casino set", () => {
  const session = {
    session: { id: TableId.make("0192e7a0-0000-7000-8000-000000000003"), startedAt: local(24, 2) },
    venue: null,
    results: [],
  };
  expect(
    awardLine({ key: "biggest_hit", value: 790000, playerId: undefined as never, session }, usd),
  ).toBe("+$7,900");
});

it("lists a trip's sessions and tables together, oldest first, and says which are live", () => {
  const alex = PlayerId.make("0192e7a0-0000-7000-8000-0000000000a1");
  const venue = {
    id: VenueId.make("0192e7a0-0000-7000-8000-000000000002"),
    name: "Circa",
    kind: "casino" as const,
    city: null,
    region: null,
    country: null,
    lat: null,
    lng: null,
    verified: true,
    groupId: null,
  };
  const result = { playerId: alex, buyIn: 100, cashOut: 300, adjustment: 0, net: 200 };
  const money = (r: typeof result) => ({
    ...r,
    buyIn: MinorUnits.make(r.buyIn),
    cashOut: MinorUnits.make(r.cashOut),
    adjustment: MinorUnits.make(r.adjustment),
    net: MinorUnits.make(r.net),
  });
  const session = {
    session: {
      id: SessionId.make("0192e7a0-0000-7000-8000-000000000011"),
      status: "closed",
      startedAt: local(24, 20),
    },
    venue,
    playerIds: [alex],
    playing: [],
    results: [money(result)],
  } as unknown as SessionSummary;
  const table = (n: number, hour: number, live: boolean): TripTable => ({
    table: {
      id: TableId.make(`0192e7a0-0000-7000-8000-00000000002${n}`),
      tripId: null,
      game: "craps",
      venueId: null,
      highLimit: true,
      starterPlayerId: alex,
    },
    venue: null,
    startedAt: local(24, hour),
    endedAt: live ? null : local(24, hour + 1),
    minutesPlayed: live ? 0 : 60,
    playerIds: [alex],
    playing: live ? [alex] : [],
    results: live ? [] : [money(result)],
    inPlay: live ? [{ playerId: alex, buyIn: MinorUnits.make(100) }] : [],
    others: [],
    myVisitId: null,
  });
  const plays = tripPlays({
    sessions: [session],
    tables: [table(1, 22, true), table(2, 18, false)],
  });
  expect(plays.map((play) => [play.kind, play.session.id, play.live])).toEqual([
    ["table", "0192e7a0-0000-7000-8000-000000000022", false],
    ["session", "0192e7a0-0000-7000-8000-000000000011", false],
    ["table", "0192e7a0-0000-7000-8000-000000000021", true],
  ]);
  expect(plays[0]!.session).toEqual({
    id: "0192e7a0-0000-7000-8000-000000000022",
    startedAt: local(24, 18),
    highLimit: true,
  });
});

it("names every trip in the groups you're in", () => {
  const trip = (id: string, name: string) => ({ id: TripId.make(id), name });
  const names = tripNames([
    { trips: [trip("0192e7a0-0000-7000-8000-0000000000f1", "Vegas")] },
    { trips: [trip("0192e7a0-0000-7000-8000-0000000000f2", "Reno")] },
  ]);
  expect([...names.values()]).toEqual(["Vegas", "Reno"]);
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

it("leads the race with the gap to the next player, falling back to your result", () => {
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
    label: "Ahead of Priya",
    gap: 9500,
    net: 27500,
    tone: "win",
    line: "1st of 3 · +$275 for the trip",
  });
  expect(raceHeadline(board, dev!, names, usd)).toEqual({
    label: "Behind Priya",
    gap: 39000,
    net: -21000,
    tone: "loss",
    line: "3rd of 3 · -$210 for the trip",
  });
  const tied = [
    { playerId: me!, net: 500, rank: 1 },
    { playerId: priya!, net: 500, rank: 1 },
  ];
  expect(raceHeadline(tied, me!, names, usd)).toMatchObject({
    label: "Tied for the lead with Priya",
    gap: null,
    tone: "ink",
  });
  expect(raceHeadline([{ playerId: me!, net: 500, rank: 1 }], me!, names, usd)).toEqual({
    label: "You lead",
    gap: null,
    net: 500,
    tone: "ink",
    line: null,
  });
  expect(raceHeadline(board, "nobody" as never, names, usd)).toBeNull();
});

it("words a return on buy-ins with its sign", () => {
  expect([0.55, -0.3, 0, 0.004, null].map(returnLabel)).toEqual(["+55%", "-30%", "0%", "0%", "–"]);
});

it("puts the trip already in scope first, then the newest still going, then the newest", () => {
  const trip = (n: number, ended: boolean) => ({
    id: TripId.make(`0192e7a0-0000-7000-8000-00000000003${n}`),
    endedAt: ended ? local(n, 12) : null,
  });
  const [ended, going, older] = [trip(3, true), trip(2, false), trip(1, true)];
  const trips = [ended, going, older];

  expect(tripInScope(trips, older.id)).toBe(older);
  expect(tripInScope(trips, null)).toBe(going);
  expect(tripInScope(trips, TripId.make("0192e7a0-0000-7000-8000-000000000099"))).toBe(going);
  expect(tripInScope([ended, older], null)).toBe(ended);
  expect(tripInScope([], null)).toBeUndefined();

  expect(scopeTrips(trips)).toEqual([going, ended, older]);
});
