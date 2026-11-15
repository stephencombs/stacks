import { expect, it } from "@effect/vitest";
import { ActorId, CurrencyCode, EntryId, PlayerId, TableId, VisitId } from "@stacks/contracts";
import {
  RecordingCommand,
  RecordingOperationId,
  type RecordingIdentity,
} from "@stacks/contracts/recordingCommands";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";

const identity = (): RecordingIdentity => ({
  playerId: PlayerId.make(crypto.randomUUID()),
  actorId: ActorId.make(crypto.randomUUID()),
});
const common = (who: RecordingIdentity) => ({
  operationId: RecordingOperationId.make(crypto.randomUUID()),
  actorId: who.actorId,
  preparedAt: DateTime.makeUnsafe("2026-11-15T12:00:00Z"),
});
const start = (who: RecordingIdentity) =>
  RecordingCommand.make({
    ...common(who),
    type: "start",
    tableId: TableId.make(crypto.randomUUID()),
    visitId: VisitId.make(crypto.randomUUID()),
    playerId: who.playerId,
    buyInId: EntryId.make(crypto.randomUUID()),
    buyIn: usd(20000),
    startedAt: DateTime.makeUnsafe("2026-11-15T12:00:00Z"),
    game: null,
    venueId: null,
    highLimit: false,
  }) as Extract<RecordingCommand, { type: "start" }>;
const choose = (
  who: RecordingIdentity,
  tableId: TableId,
  tripId: ReturnType<typeof ids.trip> | null,
) => RecordingCommand.make({ ...common(who), type: "set_table_trip", tableId, tripId });

it.layer(TestApi.layer, { timeout: "30 seconds" })("a table's trip", (it) => {
  it.effect("grants only active members whole-table access and revokes it on move or clear", () =>
    Effect.gen(function* () {
      const { alex, bea, cal, eve } = yield* users("alex", "bea", "cal", "eve");
      const first = yield* groupWith(alex, bea);
      const second = yield* groupWith(alex, cal);
      const who = identity();
      const opened = start(who);
      const privateTable = start(who);
      yield* alex.recording.push({
        payload: {
          identity: who,
          commands: [opened, privateTable, choose(who, opened.tableId, first.tripId)],
        },
      });
      const params = { tableId: opened.tableId };
      expect((yield* bea.recording.table({ params })).table.tripId).toBe(first.tripId);
      expect((yield* bea.recording.table({ params })).entries).toHaveLength(1);
      expect(yield* Effect.flip(eve.recording.table({ params }))).toMatchObject({
        _tag: "NotFound",
      });
      expect(
        yield* Effect.flip(bea.recording.table({ params: { tableId: privateTable.tableId } })),
      ).toMatchObject({ _tag: "NotFound" });
      expect(
        yield* Effect.flip(alex.trips.delete({ params: { tripId: first.tripId } })),
      ).toMatchObject({ _tag: "Conflict", reason: "trip_not_empty" });
      const before = yield* alex.recording.history();
      yield* alex.recording.push({
        payload: { identity: who, commands: [choose(who, opened.tableId, second.tripId)] },
      });
      expect(yield* Effect.flip(bea.recording.table({ params }))).toMatchObject({
        _tag: "NotFound",
      });
      expect((yield* cal.recording.table({ params })).table.tripId).toBe(second.tripId);
      yield* cal.groups.leave({ params: { groupId: second.group.id } });
      expect(yield* Effect.flip(cal.recording.table({ params }))).toMatchObject({
        _tag: "NotFound",
      });
      yield* alex.recording.push({
        payload: { identity: who, commands: [choose(who, opened.tableId, null)] },
      });
      const after = yield* alex.recording.history();
      expect(after.tables.find((table) => table.id === opened.tableId)!.tripId).toBeNull();
      expect(after.visits).toEqual(before.visits);
      expect(after.entries).toEqual(before.entries);
    }),
  );

  it.effect(
    "refuses ended, missing, non-member and staked trips without losing personal play",
    () =>
      Effect.gen(function* () {
        const { alex, bea } = yield* users("alex", "bea");
        const group = yield* groupWith(alex, bea);
        const other = yield* groupWith(bea);
        const who = identity();
        const opened = start(who);
        yield* alex.recording.push({ payload: { identity: who, commands: [opened] } });
        yield* alex.trips.end({ params: { tripId: group.tripId }, payload: {} });
        const refused = yield* alex.recording.push({
          payload: {
            identity: who,
            commands: [
              choose(who, opened.tableId, group.tripId),
              choose(who, opened.tableId, other.tripId),
              choose(who, opened.tableId, ids.trip()),
            ],
          },
        });
        expect(refused.results.map((result) => result.status)).toEqual([
          "rejected",
          "rejected",
          "rejected",
        ]);
        yield* alex.trips.reopen({ params: { tripId: group.tripId } });
        const stake = yield* alex.stakes.create({
          params: { tripId: group.tripId },
          payload: {
            id: ids.stake(),
            lenderId: group.myPlayerId,
            borrowerId: group.players.find((p) => p.id !== group.myPlayerId)!.id,
            amount: usd(10000),
            lenderShare: 50,
            note: null,
          },
        });
        expect(
          (yield* alex.recording.push({
            payload: { identity: who, commands: [choose(who, opened.tableId, group.tripId)] },
          })).results[0],
        ).toMatchObject({ status: "rejected", message: expect.stringContaining("stake") });
        const history = yield* alex.recording.history();
        expect(history.tables[0]!.tripId).toBeNull();
        expect(history.entries).toHaveLength(1);
        yield* alex.stakes.end({ params: { stakeId: stake.id }, payload: {} });
        expect(
          (yield* alex.recording.push({
            payload: { identity: who, commands: [choose(who, opened.tableId, group.tripId)] },
          })).results[0]!.status,
        ).toBe("accepted");
      }),
  );

  it.effect("refuses EUR and JPY trips without attaching USD play", () =>
    Effect.gen(function* () {
      const { alex } = yield* users("alex");
      const who = identity();
      const opened = start(who);
      yield* alex.recording.push({ payload: { identity: who, commands: [opened] } });
      for (const currency of ["EUR", "JPY"]) {
        const groupId = ids.group();
        yield* alex.groups.create({
          payload: {
            id: groupId,
            name: "Crew",
            currency: CurrencyCode.make(currency),
            displayName: "Alex",
          },
        });
        const trip = yield* alex.trips.create({
          params: { groupId },
          payload: { id: ids.trip(), name: "Away" },
        });
        const response = yield* alex.recording.push({
          payload: {
            identity: who,
            commands: [choose(who, opened.tableId, trip.id)],
          },
        });
        expect(response.results[0]).toMatchObject({
          status: "rejected",
          reason: "invalid",
          message: expect.stringContaining("USD"),
        });
      }
      const history = yield* alex.recording.history();
      expect(history.tables[0]!.tripId).toBeNull();
      expect(history.entries).toHaveLength(1);
    }),
  );

  it.effect(
    "refuses creating or reopening stakes while any table belongs to the trip, and allows them after detach",
    () =>
      Effect.gen(function* () {
        const { alex, bea } = yield* users("alex", "bea");
        const group = yield* groupWith(alex, bea);
        const request = {
          id: ids.stake(),
          lenderId: group.myPlayerId,
          borrowerId: group.players.find((p) => p.id !== group.myPlayerId)!.id,
          amount: usd(10000),
          lenderShare: 50,
          note: null,
        };
        const stake = yield* alex.stakes.create({
          params: { tripId: group.tripId },
          payload: request,
        });
        yield* alex.stakes.end({ params: { stakeId: stake.id }, payload: {} });
        const who = identity();
        const opened = start(who);
        yield* alex.recording.push({
          payload: { identity: who, commands: [opened, choose(who, opened.tableId, group.tripId)] },
        });
        expect(
          yield* Effect.flip(
            alex.stakes.create({
              params: { tripId: group.tripId },
              payload: { ...request, id: ids.stake() },
            }),
          ),
        ).toMatchObject({ _tag: "Conflict", reason: "trip_has_tables" });
        expect(
          yield* Effect.flip(alex.stakes.reopen({ params: { stakeId: stake.id } })),
        ).toMatchObject({ _tag: "Conflict", reason: "trip_has_tables" });
        // Retrying an existing creation does not open the ended stake.
        expect(
          (yield* alex.stakes.create({ params: { tripId: group.tripId }, payload: request }))
            .endedAt,
        ).not.toBeNull();
        yield* alex.recording.push({
          payload: { identity: who, commands: [choose(who, opened.tableId, null)] },
        });
        expect((yield* alex.stakes.reopen({ params: { stakeId: stake.id } })).endedAt).toBeNull();
        yield* alex.stakes.end({ params: { stakeId: stake.id }, payload: {} });
        expect(
          (yield* alex.stakes.create({
            params: { tripId: group.tripId },
            payload: { ...request, id: ids.stake() },
          })).endedAt,
        ).toBeNull();
      }),
  );

  it.effect("serializes attaching against both stake creation and reopening", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      for (const operation of ["create", "reopen"] as const) {
        const group = yield* groupWith(alex, bea);
        const request = {
          id: ids.stake(),
          lenderId: group.myPlayerId,
          borrowerId: group.players.find((p) => p.id !== group.myPlayerId)!.id,
          amount: usd(10000),
          lenderShare: 50,
          note: null,
        };
        if (operation === "reopen") {
          yield* alex.stakes.create({ params: { tripId: group.tripId }, payload: request });
          yield* alex.stakes.end({ params: { stakeId: request.id }, payload: {} });
        }
        const who = identity();
        const opened = start(who);
        yield* alex.recording.push({ payload: { identity: who, commands: [opened] } });
        const [attached, staked] = yield* Effect.all(
          [
            alex.recording
              .push({
                payload: { identity: who, commands: [choose(who, opened.tableId, group.tripId)] },
              })
              .pipe(Effect.map((r) => r.results[0]!.status === "accepted")),
            (operation === "create"
              ? alex.stakes.create({ params: { tripId: group.tripId }, payload: request })
              : alex.stakes.reopen({ params: { stakeId: request.id } })
            ).pipe(
              Effect.match({
                onSuccess: () => true,
                onFailure: (error) => {
                  expect(error).toMatchObject({ _tag: "Conflict", reason: "trip_has_tables" });
                  return false;
                },
              }),
            ),
          ],
          { concurrency: "unbounded" },
        );
        expect(Number(attached) + Number(staked)).toBe(1);
      }
    }),
  );

  it.effect("does not let a participant or recorder set the trip", () =>
    Effect.gen(function* () {
      const { alex, bea } = yield* users("alex", "bea");
      const group = yield* groupWith(alex, bea);
      const owner = identity();
      const participant = identity();
      const opened = start(owner);
      yield* alex.recording.push({ payload: { identity: owner, commands: [opened] } });
      const link = yield* alex.recording.share({ params: { tableId: opened.tableId } });
      yield* bea.recording.join({
        params: { token: link.token },
        payload: {
          identity: participant,
          player: { id: PlayerId.make(crypto.randomUUID()), displayName: "Bea" },
        },
      });
      const joined = yield* bea.recording.history();
      const playerId = joined.participants[0]!.player.id;
      for (const appointed of [false, true]) {
        if (appointed)
          yield* alex.recording.push({
            payload: {
              identity: owner,
              commands: [
                RecordingCommand.make({
                  ...common(owner),
                  type: "appoint_recorder",
                  tableId: opened.tableId,
                  playerId,
                }),
              ],
            },
          });
        expect(
          (yield* bea.recording.push({
            payload: {
              identity: participant,
              commands: [choose(participant, opened.tableId, group.tripId)],
            },
          })).results[0],
        ).toMatchObject({ status: "rejected", reason: "forbidden" });
      }
    }),
  );
});
