import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TripId,
  UserId,
  type GroupListItem,
  type Trip,
} from "@stacks/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { resolveScope, tripIsLive } from "./scope.ts";

const day = (n: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, n));
const names = ["crew", "work", "fresh", "old", "vegas", "tahoe", "poker", "deleted", "user", "me"];
const uuid = (name: string) =>
  `0192e7a0-0000-7000-8000-${String(names.indexOf(name) + 1).padStart(12, "0")}`;
const tripId = (name: string) => TripId.make(uuid(name));
const groupId = (name: string) => GroupId.make(uuid(name));
const trip = (name: string, group: string, started: number, ended: number | null = null): Trip => ({
  id: tripId(name),
  groupId: groupId(group),
  name,
  startedAt: day(started),
  endedAt: ended === null ? null : day(ended),
  createdBy: UserId.make(uuid("user")),
  createdAt: day(started),
});
const group = (name: string, trips: ReadonlyArray<Trip>): GroupListItem => ({
  group: { id: groupId(name), name, currency: CurrencyCode.make("USD"), createdAt: day(1) },
  role: "member",
  myPlayerId: PlayerId.make(uuid("me")),
  myBalance: MinorUnits.make(0),
  liveSessionCount: 0,
  currentTripId: null,
  trips: trips.toSorted(
    (a, b) => DateTime.toEpochMillis(b.startedAt) - DateTime.toEpochMillis(a.startedAt),
  ),
  mySession: null,
});

const vegas = trip("vegas", "crew", 20);
const tahoe = trip("tahoe", "crew", 2, 5);
const poker = trip("poker", "work", 10);
const crew = group("crew", [vegas, tahoe]);
const work = group("work", [poker]);
const fresh = group("fresh", []);

it("keeps the remembered trip, even an ended one", () => {
  expect(resolveScope([crew, work], tripId("tahoe"), null)).toEqual({
    item: crew,
    trip: tahoe,
  });
});

it("falls back to the newest trip still going when nothing is remembered", () => {
  expect(resolveScope([work, crew], null, null)).toEqual({ item: crew, trip: vegas });
  expect(resolveScope([crew], tripId("deleted"), null)).toEqual({ item: crew, trip: vegas });
});

it("falls back to any trip, then to a group with none", () => {
  const ended = group("old", [trip("old", "old", 1, 3)]);
  expect(resolveScope([fresh, ended], null, null)?.item).toBe(ended);
  expect(resolveScope([fresh], null, null)).toEqual({ item: fresh, trip: undefined });
  expect(resolveScope([], null, null)).toBeNull();
});

it("puts a picked group in scope over a trip from another group", () => {
  expect(resolveScope([crew, fresh], tripId("vegas"), groupId("fresh"))).toEqual({
    item: fresh,
    trip: undefined,
  });
  expect(resolveScope([crew, work], tripId("vegas"), groupId("work"))).toEqual({
    item: work,
    trip: poker,
  });
});

it("keeps the remembered trip when the picked group already holds it", () => {
  expect(resolveScope([crew], tripId("tahoe"), groupId("crew"))?.trip).toBe(tahoe);
});

it("calls a trip live when you're at its table, or it's the only one going and someone plays", () => {
  const playing = { ...crew, liveSessionCount: 1 };
  expect(tripIsLive(playing, vegas)).toBe(true);
  expect(tripIsLive(playing, tahoe)).toBe(false);
  expect(tripIsLive(crew, vegas)).toBe(false);

  const twoGoing = { ...group("crew", [vegas, trip("old", "crew", 15)]), liveSessionCount: 1 };
  expect(tripIsLive(twoGoing, vegas)).toBe(false);
  const seated = {
    ...twoGoing,
    mySession: { id: undefined as never, tripId: vegas.id, venueName: "Aria", startedAt: day(20) },
  };
  expect(tripIsLive(seated, vegas)).toBe(true);
});
