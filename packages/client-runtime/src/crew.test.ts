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
  VisitId,
  groupScope,
  type CrewActivityItem,
  type GroupListItem,
  type Trip,
} from "@stacks/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import {
  activityTarget,
  crewFeed,
  crewScopes,
  groupHappening,
  livePlayerIds,
  nameList,
  pinnedTrip,
} from "./crew.ts";

const day = (n: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, n));
const ids = ["crew", "work", "vegas", "tahoe", "poker", "user", "me", "ana", "ben", "s1", "t1"];

const uuid = (name: string) =>
  `0192e7a0-0000-7000-8000-${String(ids.indexOf(name) + 1).padStart(12, "0")}`;

const me = PlayerId.make(uuid("me"));
const ana = PlayerId.make(uuid("ana"));
const ben = PlayerId.make(uuid("ben"));

const trip: (name: string, group: string, started: number, ended?: number | null) => Trip = (
  name,
  group,
  started,
  ended = null,
) => ({
  id: TripId.make(uuid(name)),
  groupId: GroupId.make(uuid(group)),
  name,
  startedAt: day(started),
  endedAt: ended === null ? null : day(ended),
  createdBy: UserId.make(uuid("user")),
  createdAt: day(started),
});

const group: (
  name: string,
  trips: ReadonlyArray<Trip>,
  extra?: Partial<GroupListItem>,
) => GroupListItem = (name, trips, extra = {}) => ({
  group: {
    id: GroupId.make(uuid(name)),
    name,
    currency: CurrencyCode.make("USD"),
    createdAt: day(1),
  },
  role: "member",
  myPlayerId: me,
  myBalance: MinorUnits.make(0),
  liveSessionCount: 0,
  liveTripIds: [],
  currentTripId: trips.find((t) => t.endedAt === null)?.id ?? null,
  trips,
  mySession: null,
  ...extra,
});

const vegas = trip("vegas", "crew", 20);
const tahoe = trip("tahoe", "crew", 2, 5);
const poker = trip("poker", "work", 10);

it("pins the newest trip still going across your groups", () => {
  const crew = group("crew", [vegas, tahoe]);
  const work = group("work", [poker]);
  expect(pinnedTrip([work, crew])).toEqual({ item: crew, trip: vegas });
});

it("pins a trip with someone playing over a newer quiet one", () => {
  const crew = group("crew", [vegas, tahoe]);
  const work = group("work", [poker], { liveSessionCount: 1 });
  expect(pinnedTrip([crew, work])).toEqual({ item: work, trip: poker });
});

it("pins the older open trip with a live table over a newer quiet open trip in the same group", () => {
  const openTahoe = trip("tahoe", "crew", 2);

  const crew = group("crew", [vegas, openTahoe], {
    liveSessionCount: 1,
    liveTripIds: [openTahoe.id],
    currentTripId: vegas.id,
  });

  expect(pinnedTrip([crew])).toEqual({ item: crew, trip: openTahoe });
  expect(groupHappening(crew)).toEqual({ kind: "live", trip: openTahoe });
});

it("watches the pinned trip's group first, then the groups in the activity, once each", () => {
  const crew = group("crew", [vegas]);
  const work = group("work", [poker]);
  const inCrew = { group: { id: crew.group.id } };
  const inWork = { group: { id: work.group.id } };

  expect(crewScopes([work, crew], [inWork, inCrew, inWork])).toEqual([
    groupScope(crew.group.id),
    groupScope(work.group.id),
  ]);
  expect(crewScopes([], [])).toEqual([]);
});

it("watches at most ten groups", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    group: { id: GroupId.make(`0192e7a0-0000-7000-8000-9${String(i).padStart(11, "0")}`) },
  }));

  expect(crewScopes([], many)).toHaveLength(10);
});

it("pins nothing once every trip has ended", () => {
  expect(pinnedTrip([group("crew", [tahoe]), group("work", [])])).toBeNull();
});

const activityGroup = {
  id: GroupId.make(uuid("crew")),
  name: "crew",
  currency: CurrencyCode.make("USD"),
};

const activityTrip = { id: vegas.id, name: vegas.name };

const sessionLive: (players: ReadonlyArray<PlayerId>) => CrewActivityItem = (players) => ({
  kind: "session_live",
  group: activityGroup,
  trip: activityTrip,
  sessionId: SessionId.make(uuid("s1")),
  venue: {
    id: VenueId.make(uuid("s1")),
    name: "Bellagio",
    kind: "casino",
    city: null,
    region: null,
    country: null,
    lat: null,
    lng: null,
    verified: true,
    groupId: null,
  },
  players: players.map((playerId) => ({ playerId, displayName: playerId })),
  startedAt: day(20),
});

const tableItem: (
  kind: "table_live" | "table_finished",
  players: ReadonlyArray<PlayerId | null>,
  myVisitId?: VisitId | null,
) => CrewActivityItem = (kind, players, myVisitId = null) => {
  const base = {
    group: activityGroup,
    trip: activityTrip,
    tableId: TableId.make(uuid("t1")),
    venue: null,
    game: null,
    myVisitId,
  };

  return kind === "table_live"
    ? {
        ...base,
        kind,
        players: players.map((playerId) => ({ playerId, displayName: "x" })),
        startedAt: day(20),
      }
    : {
        ...base,
        kind,
        players: players.map((playerId) => ({
          playerId,
          displayName: "x",
          net: MinorUnits.make(0),
        })),
        endedAt: day(20),
      };
};

it("leaves your own live play to the LiveBar", () => {
  const groups = [group("crew", [vegas])];
  const yours = sessionLive([ana, me]);
  const theirs = sessionLive([ana, ben]);
  const yourTable = tableItem("table_live", [me, null]);
  const finished = tableItem("table_finished", [me, ana]);
  expect(crewFeed([yours, theirs, yourTable, finished], groups)).toEqual([theirs, finished]);
});

it("opens a session, your visit at a table, or else the trip", () => {
  expect(activityTarget(sessionLive([ana]))).toEqual({
    kind: "session",
    sessionId: uuid("s1"),
  });
  const visitId = VisitId.make(uuid("me"));
  expect(activityTarget(tableItem("table_finished", [me], visitId))).toEqual({
    kind: "visit",
    visitId,
  });
  expect(activityTarget(tableItem("table_finished", [ana]))).toEqual({
    kind: "trip",
    tripId: vegas.id,
  });
});

it("says what a group has going: a live trip, else when its last trip started", () => {
  expect(groupHappening(group("crew", [vegas], { liveSessionCount: 2 }))).toEqual({
    kind: "live",
    trip: vegas,
  });
  expect(groupHappening(group("crew", [vegas, tahoe]))).toEqual({ kind: "started", trip: vegas });
  expect(groupHappening(group("work", []))).toEqual({ kind: "none" });
});

it("names a few players and counts the rest", () => {
  expect(nameList([])).toBe("");
  expect(nameList(["Ana"])).toBe("Ana");
  expect(nameList(["Ana", "Ben"])).toBe("Ana and Ben");
  expect(nameList(["Ana", "Ben", "Cy"])).toBe("Ana, Ben and Cy");
  expect(nameList(["Ana", "Ben", "Cy", "Di", "Ed"])).toBe("Ana, Ben and 3 others");
});

it("lists who's playing at the trip's live tables, each once", () => {
  expect(
    livePlayerIds([
      { live: true, playing: [ana, me] },
      { live: false, playing: [ben] },
      { live: true, playing: [me, ben] },
    ]),
  ).toEqual([ana, me, ben]);
});
