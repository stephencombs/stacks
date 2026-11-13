import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import type { CrewActivityItem, EntryId, PlayerId, SessionId, TripId } from "@stacks/contracts";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const day = (n: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 20 + n, 20));

// Trips created without a start time start now, so now must come after every day(n) a test uses.
const afterTheseDays = TestClock.setTime(Date.UTC(2026, 10, 1));

const startSession = Effect.fn("test.startSession")(function* (
  client: Client,
  tripId: TripId,
  playerIds: readonly [PlayerId, ...Array<PlayerId>],
  startedAt: DateTime.Utc,
) {
  const venue = yield* catalogVenue(client);
  const id = ids.session();
  yield* client.sessions.create({
    params: { tripId },
    payload: { id, venueId: venue.id, game: "blackjack", playerIds, notes: null, startedAt },
  });
  return id;
});

const buyIn = Effect.fn("test.buyIn")(function* (
  client: Client,
  sessionId: SessionId,
  playerId: PlayerId,
  amount: number,
  replacesEntryId: EntryId | null = null,
) {
  const id = ids.entry();
  yield* client.ledger.addEntry({
    params: { sessionId },
    payload: {
      id,
      kind: "buy_in",
      playerId,
      counterpartyId: null,
      amount: usd(amount),
      note: null,
      replacesEntryId,
    },
  });
  return id;
});

const feed = (client: Client, cursor?: string) =>
  client.crew.activity({ query: cursor === undefined ? {} : { cursor } });

const itemId = (item: CrewActivityItem) =>
  item.kind === "trip_started" ? item.trip.id : item.sessionId;

const byPlayer = (item: CrewActivityItem | undefined) =>
  item?.kind === "session_finished"
    ? [...item.players].sort((a, b) => a.playerId.localeCompare(b.playerId))
    : [];

const itemTime = (item: CrewActivityItem) =>
  DateTime.toEpochMillis(item.kind === "session_finished" ? item.endedAt : item.startedAt);

it.layer(TestApi.layer, { timeout: "30 seconds" })("crew activity", (it) => {
  it.effect("gathers every group you're in, newest first", () =>
    Effect.gen(function* () {
      yield* afterTheseDays;
      const { alex, bea, cal } = yield* users("alex", "bea", "cal");
      const vegas = yield* groupWith(alex, bea);
      const reno = yield* groupWith(cal, alex);
      const beaId = vegas.players.find((p) => p.id !== vegas.myPlayerId)!.id;
      const alexInReno = reno.players.find((p) => p.id !== reno.myPlayerId)!.id;

      const finished = yield* startSession(alex, vegas.tripId, [vegas.myPlayerId, beaId], day(1));
      yield* buyIn(alex, finished, vegas.myPlayerId, 1000);
      yield* alex.sessions.close({
        params: { sessionId: finished },
        payload: {
          endedAt: day(2),
          cashOuts: [
            { id: ids.entry(), playerId: vegas.myPlayerId, amount: usd(2500) },
            { id: ids.entry(), playerId: beaId, amount: usd(0) },
          ],
        },
      });
      const live = yield* startSession(cal, reno.tripId, [alexInReno], day(3));

      const { items, nextCursor } = yield* feed(alex);
      expect(nextCursor).toBeNull();
      expect(new Set(items.map(itemId))).toEqual(
        new Set([vegas.tripId, reno.tripId, finished, live]),
      );
      const times = items.map(itemTime);
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(items.slice(-2).map(itemId)).toEqual([live, finished]);

      expect(items.find((item) => itemId(item) === live)).toMatchObject({
        kind: "session_live",
        group: { id: reno.group.id, name: "Vegas crew", currency: "USD" },
        trip: { id: reno.tripId, name: "Vegas" },
        players: [{ playerId: alexInReno, displayName: "Member 1" }],
      });
      expect(items.find((item) => itemId(item) === finished)).toMatchObject({
        kind: "session_finished",
        group: { id: vegas.group.id },
        trip: { id: vegas.tripId },
      });
      // Players seated in one request sit down together, so their order is a tie.
      expect(byPlayer(items.find((item) => itemId(item) === finished))).toEqual(
        [
          { playerId: vegas.myPlayerId, displayName: "Owner", net: 1500 },
          { playerId: beaId, displayName: "Member 1", net: 0 },
        ].sort((a, b) => a.playerId.localeCompare(b.playerId)),
      );
      expect(items.find((item) => itemId(item) === vegas.tripId)).toMatchObject({
        kind: "trip_started",
        group: { id: vegas.group.id },
      });
    }),
  );

  it.effect("pages without skipping or repeating, even when items share a time", () =>
    Effect.gen(function* () {
      yield* afterTheseDays;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      // Three trips at each time, so pages split between items that tie.
      for (let i = 0; i < 54; i++) {
        yield* alex.trips.create({
          params: { groupId: group.group.id },
          payload: { id: ids.trip(), name: `Trip ${i}`, startedAt: day(-Math.floor(i / 3)) },
        });
      }

      const first = yield* feed(alex);
      expect(first.items).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();
      // Something newer arriving doesn't shift the older pages.
      yield* TestClock.adjust("1 hour");
      yield* alex.trips.create({
        params: { groupId: group.group.id },
        payload: { id: ids.trip(), name: "Late" },
      });
      const second = yield* feed(alex, first.nextCursor!);
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();

      const pagedIds = [...first.items, ...second.items].map(itemId);
      expect(new Set(pagedIds).size).toBe(55);
      const all = (yield* feed(alex)).items.map(itemId);
      expect(all.slice(1)).toEqual(pagedIds.slice(0, 49));
      expect(yield* Effect.flip(feed(alex, "not-a-cursor"))).toMatchObject({
        _tag: "InvalidRequest",
      });
    }),
  );

  it.effect("shows only groups you're an active member of", () =>
    Effect.gen(function* () {
      const { alex, bea, cal, dee, eve } = yield* users("alex", "bea", "cal", "dee", "eve");
      const group = yield* groupWith(alex, bea, cal);
      const groupId = group.group.id;
      yield* startSession(alex, group.tripId, [group.players[1]!.id], day(1));
      // Bea also plays in a group Alex isn't in; her seat there must not show up for Alex.
      const elsewhere = yield* groupWith(dee, bea);
      const beaElsewhere = elsewhere.players.find((p) => p.id !== elsewhere.myPlayerId)!.id;
      yield* startSession(dee, elsewhere.tripId, [beaElsewhere], day(2));

      const groupsIn = (page: { readonly items: ReadonlyArray<CrewActivityItem> }) =>
        new Set(page.items.map((item) => item.group.id));
      expect(groupsIn(yield* feed(alex))).toEqual(new Set([groupId]));
      expect(groupsIn(yield* feed(bea))).toEqual(new Set([groupId, elsewhere.group.id]));
      expect((yield* feed(eve)).items).toEqual([]);

      yield* bea.groups.leave({ params: { groupId } });
      expect(groupsIn(yield* feed(bea))).toEqual(new Set([elsewhere.group.id]));
      expect(groupsIn(yield* feed(cal))).toEqual(new Set([groupId]));
      yield* alex.groups.removeMember({ params: { groupId, userId: group.players[2]!.userId! } });
      expect((yield* feed(cal)).items).toEqual([]);
    }),
  );

  it.effect("leaves voided entries out of a finished table's results", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const beaId = group.players.find((p) => p.id !== group.myPlayerId)!.id;
      const sessionId = yield* startSession(alex, group.tripId, [group.myPlayerId, beaId], day(1));
      const mistake = yield* buyIn(alex, sessionId, group.myPlayerId, 1000);
      yield* buyIn(alex, sessionId, group.myPlayerId, 400, mistake);
      yield* buyIn(alex, sessionId, beaId, 200);
      const voided = yield* buyIn(alex, sessionId, beaId, 500);
      yield* alex.ledger.voidEntry({ params: { entryId: voided }, payload: { reason: null } });
      yield* alex.sessions.close({
        params: { sessionId },
        payload: {
          endedAt: day(2),
          cashOuts: [
            { id: ids.entry(), playerId: group.myPlayerId, amount: usd(900) },
            { id: ids.entry(), playerId: beaId, amount: usd(0) },
          ],
        },
      });

      const finished = (yield* feed(bea)).items.find((item) => itemId(item) === sessionId);
      expect(finished?.kind).toBe("session_finished");
      expect(new Map(byPlayer(finished).map((p) => [p.playerId, p.net]))).toEqual(
        new Map([
          [group.myPlayerId, 500],
          [beaId, -200],
        ]),
      );
    }),
  );
});
