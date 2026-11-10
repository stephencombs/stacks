import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { PlayerId } from "@stacks/contracts";
import { RecordingCommand } from "@stacks/contracts/recordingCommands";

import {
  correct,
  device,
  finish,
  rebuy,
  sharedTable,
  sitDown,
  start,
  uuid,
} from "../testing/recording.ts";
import { TestApi } from "../testing/TestApi.ts";

it.layer(TestApi.layer, { timeout: "30 seconds" })("joining tables", (it) => {
  it.effect("lets a joiner record their own play, and refuses anyone else's", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, opened, token } = yield* sharedTable();
      const bea = yield* device();
      const joined = yield* bea.join(token);
      expect(joined.table.id).toBe(opened.tableId);

      const sat = sitDown(bea.identity, opened.tableId, joined.player.id);
      expect(yield* bea.push(sat, rebuy(bea.identity, sat.visitId))).toEqual([
        "accepted",
        "accepted",
      ]);

      // The starter's play, a new player, and the starter's entry are all someone else's.
      const cal = PlayerId.make(uuid());
      const sneaky = [
        rebuy(bea.identity, opened.visitId),
        sitDown(bea.identity, opened.tableId, starter.identity.playerId),
        correct(bea.identity, opened.visitId, opened.buyInId),
        RecordingCommand.make({
          ...sitDown(bea.identity, opened.tableId, cal),
          newPlayer: { id: cal, displayName: "Cal" },
        }),
      ];
      expect(yield* bea.push(...sneaky)).toEqual([
        "forbidden",
        "forbidden",
        "forbidden",
        "forbidden",
      ]);
      const ids = sneaky.map((command) => command.operationId);
      expect(yield* sql`select 1 from personal_operations where id in ${sql.in(ids)}`).toEqual([]);
      const [starterVisit] = yield* sql<{ revision: number }>`
        select revision from personal_visits where id = ${opened.visitId}
      `;
      expect(starterVisit?.revision).toBe(0);
      expect(
        yield* sql`select 1 from personal_entries where visit_id = ${opened.visitId}`,
      ).toHaveLength(1);

      const view = yield* bea.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("participant");
      expect(view.viewerPlayerId).toBe(joined.player.id);
      expect(view.visits).toHaveLength(2);
    }),
  );

  it.effect("never binds a joiner to a player that already exists", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, token } = yield* sharedTable();
      const bea = yield* device();
      for (const id of [starter.identity.playerId, bea.identity.playerId]) {
        const refused = yield* bea.join(token, { id, displayName: "Alex" }).pipe(Effect.flip);
        expect(refused).toMatchObject({ _tag: "Conflict", reason: "id_taken" });
      }
      expect(
        yield* sql`select 1 from player_actors where actor_id = ${bea.identity.actorId} and bound_via = 'join'`,
      ).toEqual([]);
      expect(
        yield* sql`select 1 from players where id = ${starter.identity.playerId} and display_name = 'Alex'`,
      ).toEqual([]);

      const starterJoins = yield* starter.join(token).pipe(Effect.flip);
      expect(starterJoins).toMatchObject({ _tag: "Conflict", reason: "table_starter" });
    }),
  );

  it.effect("lets the starter correct a joiner's entry, and the joiner sees it", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const bea = yield* device();
      const { player } = yield* bea.join(token);
      const sat = sitDown(bea.identity, opened.tableId, player.id);
      yield* bea.push(sat);

      expect(yield* starter.push(correct(starter.identity, sat.visitId, sat.buyInId))).toEqual([
        "accepted",
      ]);
      // A joiner can't correct the starter's entry back, even holding the right revision.
      expect(yield* bea.push(correct(bea.identity, opened.visitId, opened.buyInId))).toEqual([
        "forbidden",
      ]);

      const history = yield* bea.client.recording.history();
      expect(history.tables.map((table) => table.id)).toEqual([opened.tableId]);
      expect(history.participants).toEqual([{ tableId: opened.tableId, player }]);
      expect(history.visits.map((visit) => visit.id)).toEqual([sat.visitId]);
      expect(history.commands.map((command) => command.type)).toEqual(["join_table", "correct"]);
      expect(history.entries.find((entry) => entry.id === sat.buyInId)?.voidedAt).not.toBeNull();

      // The starter's device gets the joiner's play, and who they are.
      const own = yield* starter.client.recording.history();
      expect(own.participants).toEqual([{ tableId: opened.tableId, player }]);
      expect(own.commands.map((command) => command.type)).toEqual([
        "start",
        "join_table",
        "correct",
      ]);
    }),
  );

  it.effect("keeps one open visit per player, and returning starts a new one", () =>
    Effect.gen(function* () {
      const { opened, token } = yield* sharedTable();
      const bea = yield* device();
      const { player } = yield* bea.join(token);
      const first = sitDown(bea.identity, opened.tableId, player.id);
      expect(yield* bea.push(first)).toEqual(["accepted"]);
      expect(yield* bea.push(sitDown(bea.identity, opened.tableId, player.id, 6))).toEqual([
        "invalid",
      ]);

      const back = sitDown(bea.identity, opened.tableId, player.id, 30);
      expect(yield* bea.push(finish(bea.identity, first.visitId), back)).toEqual([
        "accepted",
        "accepted",
      ]);
      const view = yield* bea.client.recording.table({ params: { tableId: opened.tableId } });
      const visits = view.visits.filter((item) => item.visit.playerId === player.id);
      expect(visits.map((item) => item.visit.finishedAt === null)).toEqual([false, true]);
    }),
  );

  it.effect("stops new joins once the link is revoked, and keeps existing participants", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const bea = yield* device();
      const { player } = yield* bea.join(token);
      yield* starter.client.recording.unshare({ params: { tableId: opened.tableId } });

      const cal = yield* device();
      expect(yield* cal.join(token).pipe(Effect.flip)).toMatchObject({
        _tag: "NotFound",
        resource: "table",
      });
      expect(yield* bea.join(token).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" });

      expect(yield* bea.push(sitDown(bea.identity, opened.tableId, player.id))).toEqual([
        "accepted",
      ]);
      const view = yield* bea.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("participant");
    }),
  );

  it.effect("shows a participant nothing of the other participants' other tables", () =>
    Effect.gen(function* () {
      const { opened, token } = yield* sharedTable();
      const bea = yield* device();
      const cal = yield* device();
      yield* bea.join(token);
      const { player: calHere } = yield* cal.join(token, {
        id: PlayerId.make(uuid()),
        displayName: "Cal",
      });
      yield* cal.push(sitDown(cal.identity, opened.tableId, calHere.id));
      // Cal's own table, which Bea has never been to.
      const elsewhere = start(cal.identity);
      yield* cal.push(elsewhere);

      expect(
        yield* bea.client.recording
          .table({ params: { tableId: elsewhere.tableId } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound", resource: "table" });
      const history = yield* bea.client.recording.history();
      expect(history.tables.map((table) => table.id)).toEqual([opened.tableId]);
      expect(history.visits).toEqual([]);
      expect(history.participants.map((item) => item.player.displayName)).toEqual(["Bea"]);
      expect(yield* bea.push(rebuy(bea.identity, elsewhere.visitId))).toEqual(["forbidden"]);
    }),
  );

  it.effect("treats a retried join and a retried push as the same request", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { opened, token } = yield* sharedTable();
      const bea = yield* device();
      const player = { id: PlayerId.make(uuid()), displayName: "Bea" };
      const first = yield* bea.join(token, player);
      const again = yield* bea.join(token, player);
      expect(again).toEqual(first);
      // A device that lost the answer and asks with a new ID gets the player it already has.
      const fresh = yield* bea.join(token, { id: PlayerId.make(uuid()), displayName: "Bea" });
      expect(fresh.player).toEqual(first.player);
      expect(
        yield* sql`select 1 from table_participants where table_id = ${opened.tableId}`,
      ).toHaveLength(1);

      const sat = sitDown(bea.identity, opened.tableId, player.id);
      expect(yield* bea.push(sat)).toEqual(["accepted"]);
      expect(yield* bea.push(sat)).toEqual(["accepted"]);
      expect(yield* sql`select 1 from personal_visits where player_id = ${player.id}`).toHaveLength(
        1,
      );
    }),
  );
});
