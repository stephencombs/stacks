import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  EntryId,
  PlayerId,
  type CrewActivityItem,
  type GroupStats,
  type TableId,
  type TripId,
  type VisitId,
} from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { at, finish, openTable, seatNew, sitDown, start, uuid } from "../testing/recording.ts";
import { TestApi } from "../testing/TestApi.ts";
import * as LegacyMigration from "./LegacyMigration.ts";
import { finishHistoricalSession, seedEntry, seedSession } from "../testing/legacySessions.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const identity = (): RecordingIdentity => ({
  playerId: PlayerId.make(uuid()),
  actorId: ActorId.make(uuid()),
});

const push = (client: Client, who: RecordingIdentity, ...commands: Array<RecordingCommand>) =>
  client.recording
    .push({ payload: { identity: who, commands } })
    .pipe(Effect.map(({ results }) => results.map((result) => result.status)));

const toTrip = (who: RecordingIdentity, tableId: TableId, tripId: TripId | null) =>
  RecordingCommand.make({
    type: "set_table_trip",
    operationId: RecordingOperationId.make(uuid()),
    actorId: who.actorId,
    preparedAt: at(1),
    tableId,
    tripId,
  });

/** Cashes a visit out for `amount` at `minutes` past the hour. */
const finishAt = (who: RecordingIdentity, visitId: VisitId, minutes: number, amount: number) =>
  RecordingCommand.make({
    type: "finish",
    operationId: RecordingOperationId.make(uuid()),
    actorId: who.actorId,
    preparedAt: at(minutes),
    visitId,
    expectedRevision: 0,
    entryId: EntryId.make(uuid()),
    amount: usd(amount),
    finishedAt: at(minutes),
  });

const tableItems = (items: ReadonlyArray<CrewActivityItem>, tableId: TableId) =>
  items.filter(
    (item) =>
      (item.kind === "table_live" || item.kind === "table_finished") && item.tableId === tableId,
  );

const nets = (results: ReadonlyArray<{ readonly playerId: PlayerId; readonly net: number }>) =>
  Object.fromEntries(results.map((result) => [result.playerId, result.net]));

/** Each member's result over every play in a group's stats. */
const statNets = (stats: GroupStats) => {
  const totals: Record<string, number> = {};
  for (const play of stats.plays)
    for (const { playerId, net } of play.results) totals[playerId] = (totals[playerId] ?? 0) + net;
  return totals;
};

it.layer(TestApi.layer, { timeout: "30 seconds" })("group reads from tables", (it) => {
  it.effect(
    "shows a trip's table once in the trip, group stats and Crew, counting only linked players",
    () =>
      Effect.gen(function* () {
        const { alex, bea } = yield* users("alex", "bea");
        const group = yield* groupWith(alex, bea);
        const alexId = group.myPlayerId;
        const beaId = group.players.find((player) => player.id !== alexId)!.id;
        const me = identity();
        const opened = start(me);
        // Bea is seated by name and later takes her history over; Dave never joins the group.
        const beaSeat = seatNew(me, opened.tableId, "Bea");
        const dave = seatNew(me, opened.tableId, "Dave");
        expect(
          yield* push(alex, me, opened, beaSeat, dave, toTrip(me, opened.tableId, group.tripId)),
        ).toEqual(["accepted", "accepted", "accepted", "accepted"]);
        const invite = yield* alex.recording.invitePlayer({
          params: { playerId: beaSeat.playerId },
        });
        yield* bea.recording.redeemInvite({
          params: { token: invite.token },
          payload: { identity: identity() },
        });

        const live = yield* alex.trips.get({ params: { tripId: group.tripId } });
        expect(live.tables).toHaveLength(1);
        expect(live.tables[0]).toMatchObject({
          endedAt: null,
          playing: [alexId, beaId],
          inPlay: [
            { playerId: alexId, buyIn: 20000 },
            { playerId: beaId, buyIn: 10000 },
          ],
          results: [],
        });
        expect(live.tables[0]!.others).toMatchObject([{ displayName: "Dave", playing: true }]);
        expect(tableItems((yield* bea.crew.activity({ query: {} })).items, opened.tableId)).toEqual(
          [expect.objectContaining({ kind: "table_live" })],
        );
        expect((yield* alex.groups.stats({ params: { groupId: group.group.id } })).plays).toEqual(
          [],
        );
        expect(
          (yield* alex.groups.list()).find((item) => item.group.id === group.group.id)!,
        ).toMatchObject({ liveSessionCount: 1, liveTripIds: [group.tripId] });

        // Each finishes on 12,000: Alex bought in 20,000 and Bea and Dave 10,000.
        expect(
          yield* push(
            alex,
            me,
            finish(me, opened.visitId),
            finish(me, beaSeat.visitId),
            finish(me, dave.visitId),
          ),
        ).toEqual(["accepted", "accepted", "accepted"]);

        const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
        expect(trip.tables).toHaveLength(1);
        const [table] = trip.tables;
        expect(table!.table.id).toBe(opened.tableId);
        expect(table!.endedAt).not.toBeNull();
        expect(table!.venue).toBeNull();
        expect(table!.playerIds).toEqual([alexId, beaId]);
        expect(nets(table!.results)).toEqual({ [alexId]: -8000, [beaId]: 2000 });
        expect(table!.others).toEqual([{ displayName: "Dave", playing: false, net: 2000 }]);
        expect(table!.myVisitId).toBe(opened.visitId);
        expect(
          (yield* bea.trips.get({ params: { tripId: group.tripId } })).tables[0]!.myVisitId,
        ).toBe(beaSeat.visitId);

        const stats = yield* bea.groups.stats({ params: { groupId: group.group.id } });
        expect(stats.plays.map((play) => [play.id, play.tripId, play.game])).toEqual([
          [opened.tableId, group.tripId, "blackjack"],
        ]);
        expect(statNets(stats)).toEqual({ [alexId]: -8000, [beaId]: 2000 });
        // Alex played from the start; Bea sat down five minutes in.
        expect(stats.plays[0]!.results.map((result) => result.milliseconds)).toEqual([
          20 * 60_000,
          15 * 60_000,
        ]);
        expect(stats.venues).toEqual([]);

        const feed = tableItems((yield* alex.crew.activity({ query: {} })).items, opened.tableId);
        expect(feed).toHaveLength(1);
        expect(feed[0]).toMatchObject({
          kind: "table_finished",
          trip: { id: group.tripId },
          myVisitId: opened.visitId,
        });
        expect(feed[0]!.kind === "table_finished" && feed[0]!.players).toEqual([
          { playerId: alexId, displayName: "Owner", net: -8000 },
          { playerId: beaId, displayName: "Member 1", net: 2000 },
          { playerId: null, displayName: "Dave", net: 2000 },
        ]);
        expect(
          (yield* alex.groups.list()).find((item) => item.group.id === group.group.id)!,
        ).toMatchObject({ liveSessionCount: 0, liveTripIds: [] });
      }),
  );

  it.effect("keeps a removed member's earlier play and leaves their later play out", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const beaPlayer = group.players.find((player) => player.id !== group.myPlayerId)!;
      const beaMe = identity();
      const before = start(beaMe);
      expect(
        yield* push(
          bea,
          beaMe,
          before,
          toTrip(beaMe, before.tableId, group.tripId),
          finish(beaMe, before.visitId),
        ),
      ).toEqual(["accepted", "accepted", "accepted"]);

      // Alex's table, where Bea sits down again after she's gone.
      const alexMe = identity();
      const shared = start(alexMe);
      expect(
        yield* push(alex, alexMe, shared, toTrip(alexMe, shared.tableId, group.tripId)),
      ).toEqual(["accepted", "accepted"]);

      yield* alex.groups.removeMember({
        params: { groupId: group.group.id, userId: beaPlayer.userId! },
      });
      yield* sql`
        update memberships set left_at = ${DateTime.toDateUtc(at(10))}
        where group_id = ${group.group.id} and user_id = ${beaPlayer.userId!}
      `;
      const later = start(beaMe);
      expect(yield* push(bea, beaMe, later, toTrip(beaMe, later.tableId, group.tripId))).toEqual([
        "accepted",
        "rejected",
      ]);
      const { token } = yield* alex.recording.share({ params: { tableId: shared.tableId } });
      const { player } = yield* bea.recording.join({
        params: { token },
        payload: { identity: beaMe, player: { id: PlayerId.make(uuid()), displayName: "Bea" } },
      });
      const back = sitDown(beaMe, shared.tableId, player.id, 15);
      expect(yield* push(bea, beaMe, back, finish(beaMe, back.visitId))).toEqual([
        "accepted",
        "accepted",
      ]);
      expect(yield* push(alex, alexMe, finish(alexMe, shared.visitId))).toEqual(["accepted"]);

      const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(trip.tables.map((table) => table.table.id).toSorted()).toEqual(
        [before.tableId, shared.tableId].toSorted(),
      );
      const earlier = trip.tables.find((table) => table.table.id === before.tableId)!;
      expect(nets(earlier.results)).toEqual({ [beaPlayer.id]: -8000 });
      const afterwards = trip.tables.find((table) => table.table.id === shared.tableId)!;
      expect(afterwards.playerIds).toEqual([group.myPlayerId]);
      expect(afterwards.others).toEqual([{ displayName: "Bea", playing: false, net: 2000 }]);

      const stats = yield* alex.groups.stats({ params: { groupId: group.group.id } });
      expect(stats.plays).toHaveLength(2);
      expect(statNets(stats)).toEqual({ [beaPlayer.id]: -8000, [group.myPlayerId]: -8000 });
      expect(yield* Effect.flip(bea.trips.get({ params: { tripId: group.tripId } }))).toMatchObject(
        { _tag: "Forbidden" },
      );
      // Removed, Bea loses the group's stats too.
      expect(
        yield* Effect.flip(bea.groups.stats({ params: { groupId: group.group.id } })),
      ).toMatchObject({ _tag: "Forbidden" });
    }),
  );

  it.effect("leaves out a member's play from while they were away, after they rejoin", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const beaPlayer = group.players.find((player) => player.id !== group.myPlayerId)!;
      const { code } = yield* alex.invites.create({
        params: { groupId: group.group.id },
        payload: { id: ids.invite(), maxUses: null },
      });
      const alexMe = identity();
      const opened = start(alexMe);
      expect(
        yield* push(alex, alexMe, opened, toTrip(alexMe, opened.tableId, group.tripId)),
      ).toEqual(["accepted", "accepted"]);
      const { token } = yield* alex.recording.share({ params: { tableId: opened.tableId } });
      const beaMe = identity();
      const { player } = yield* bea.recording.join({
        params: { token },
        payload: { identity: beaMe, player: { id: PlayerId.make(uuid()), displayName: "Bea" } },
      });

      // Bea plays, leaves the group and plays, comes back and plays: 10,000 in each time.
      const before = sitDown(beaMe, opened.tableId, player.id, 1);
      expect(yield* push(bea, beaMe, before, finishAt(beaMe, before.visitId, 5, 11000))).toEqual([
        "accepted",
        "accepted",
      ]);
      yield* bea.groups.leave({ params: { groupId: group.group.id } });
      const away = sitDown(beaMe, opened.tableId, player.id, 15);
      expect(yield* push(bea, beaMe, away, finishAt(beaMe, away.visitId, 20, 50000))).toEqual([
        "accepted",
        "accepted",
      ]);
      yield* bea.invites.accept({ params: { code }, payload: { displayName: "Bea" } });
      yield* sql`
        update membership_absences
        set left_at = ${DateTime.toDateUtc(at(10))}, returned_at = ${DateTime.toDateUtc(at(30))}
        where group_id = ${group.group.id} and user_id = ${beaPlayer.userId!}
      `;
      const back = sitDown(beaMe, opened.tableId, player.id, 35);
      expect(yield* push(bea, beaMe, back, finishAt(beaMe, back.visitId, 40, 12000))).toEqual([
        "accepted",
        "accepted",
      ]);
      expect(yield* push(alex, alexMe, finishAt(alexMe, opened.visitId, 45, 20000))).toEqual([
        "accepted",
      ]);

      const [table] = (yield* alex.trips.get({ params: { tripId: group.tripId } })).tables;
      expect(nets(table!.results)).toEqual({ [group.myPlayerId]: 0, [beaPlayer.id]: 3000 });
      expect(table!.others).toEqual([{ displayName: "Bea", playing: false, net: 40000 }]);
    }),
  );

  it.effect("never counts a member's play recorded outside the group's trips", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      const own = start(me);
      expect(yield* push(alex, me, own, finish(me, own.visitId))).toEqual(["accepted", "accepted"]);
      expect((yield* alex.groups.stats({ params: { groupId: group.group.id } })).plays).toEqual([]);
    }),
  );

  it.effect("leaves deleted tables out of the trip, group stats and Crew", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex } = yield* users("alex");
      const group = yield* groupWith(alex);
      const me = identity();
      // A table nobody played at, deleted the usual way: it leaves its trip.
      const empty = openTable(me);
      const deleteEmpty = RecordingCommand.make({
        type: "delete_table",
        operationId: RecordingOperationId.make(uuid()),
        actorId: me.actorId,
        preparedAt: at(2),
        tableId: empty.tableId,
      });
      // A played table marked deleted with its trip still set: reads must not trust trip_id alone.
      const played = start(me);
      expect(
        yield* push(
          alex,
          me,
          empty,
          toTrip(me, empty.tableId, group.tripId),
          deleteEmpty,
          played,
          toTrip(me, played.tableId, group.tripId),
          finish(me, played.visitId),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted", "accepted"]);
      yield* sql`update tables set deleted_at = now() where id = ${played.tableId}`;

      const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect(trip.tables).toEqual([]);
      expect((yield* alex.groups.stats({ params: { groupId: group.group.id } })).plays).toEqual([]);
      const feed = (yield* alex.crew.activity({ query: {} })).items;
      expect(tableItems(feed, played.tableId)).toEqual([]);
      expect(tableItems(feed, empty.tableId)).toEqual([]);
    }),
  );

  it.effect("counts an older group session once after it's imported as a table in its trip", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const venue = yield* catalogVenue(alex);
      const sessionId = ids.session();
      yield* seedSession(group.tripId, {
        id: sessionId,
        venueId: venue.id,
        game: "blackjack",
        playerIds: [group.myPlayerId],
        notes: null,
      });
      for (const [kind, amount] of [
        ["buy_in", 10000],
        ["cash_out", 15000],
      ] as const)
        yield* seedEntry(sessionId, {
          id: ids.entry(),
          kind,
          playerId: group.myPlayerId,
          counterpartyId: null,
          amount: usd(amount),
          note: null,
          replacesEntryId: null,
        });
      yield* finishHistoricalSession(sessionId);
      yield* LegacyMigration.importLegacy({ scope: [group.group.id], dryRun: false });

      const trip = yield* alex.trips.get({ params: { tripId: group.tripId } });
      expect([trip.sessions.length, trip.tables.length]).toEqual([1, 0]);
      const stats = yield* alex.groups.stats({ params: { groupId: group.group.id } });
      expect(stats.plays).toHaveLength(1);
      expect(statNets(stats)).toEqual({ [group.myPlayerId]: 5000 });
      expect(stats.venues.map((v) => v.id)).toEqual([venue.id]);
      const feed = (yield* alex.crew.activity({ query: {} })).items.filter(
        (item) => item.kind !== "trip_started" && item.trip.id === group.tripId,
      );
      expect(feed).toHaveLength(1);

      const stake = yield* alex.stakes.create({
        params: { tripId: group.tripId },
        payload: {
          id: ids.stake(),
          lenderId: group.myPlayerId,
          borrowerId: group.players.find((player) => player.id !== group.myPlayerId)!.id,
          amount: usd(1000),
          lenderShare: 50,
          note: null,
        },
      });
      yield* alex.stakes.end({ params: { stakeId: stake.id }, payload: {} });
      expect(yield* alex.stakes.reopen({ params: { stakeId: stake.id } })).toMatchObject({
        endedAt: null,
      });
    }),
  );
});
