import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { PlayerId } from "@stacks/contracts";
import { RecordingCommand, RecordingOperationId } from "@stacks/contracts/recordingCommands";

import {
  account,
  deleteTable,
  device,
  finish,
  openTable,
  rebuy,
  recorderCommand,
  seatNew,
  sitDown,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";

it.layer(TestApi.layer)("tables recorded without playing", (it) => {
  it.effect("records, shares and finishes a table its starter never plays at", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = openTable(starter.identity);
      const priya = seatNew(starter.identity, opened.tableId, "Priya");
      expect(yield* starter.push(opened, priya, rebuy(starter.identity, priya.visitId))).toEqual([
        "accepted",
        "accepted",
        "accepted",
      ]);

      const { token } = yield* starter.client.recording.share({
        params: { tableId: opened.tableId },
      });

      const dev = yield* device();
      const { player } = yield* dev.join(token, { id: PlayerId.make(uuid()), displayName: "Dev" });
      const sat = sitDown(dev.identity, opened.tableId, player.id);
      expect(yield* dev.push(sat)).toEqual(["accepted"]);
      expect(yield* dev.push(rebuy(dev.identity, priya.visitId, 1))).toEqual(["forbidden"]);
      expect(yield* dev.push(deleteTable(dev.identity, opened.tableId))).toEqual(["forbidden"]);

      expect(yield* starter.push(finish(starter.identity, priya.visitId, 1))).toEqual(["accepted"]);
      let view = yield* starter.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("starter");

      const playing = (id: string) =>
        view.visits.find((item) => item.visit.id === id)?.visit.finishedAt === null;

      expect([playing(priya.visitId), playing(sat.visitId)]).toEqual([false, true]);
      expect(yield* starter.push(finish(starter.identity, sat.visitId))).toEqual(["accepted"]);
      view = yield* starter.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.visits.every((item) => item.finalResult !== null)).toBe(true);
      expect(view.visits.some((item) => item.visit.playerId === starter.identity.playerId)).toBe(
        false,
      );

      expect(yield* starter.push(deleteTable(starter.identity, opened.tableId))).toEqual([
        "invalid",
      ]);
      const history = yield* starter.client.recording.history();
      expect(history.commands.map((command) => command.type)).toEqual([
        "open_table",
        "join_table",
        "add",
        "join_table",
        "finish",
        "finish",
      ]);
      expect(history.tables.map((table) => table.id)).toContain(opened.tableId);
    }),
  );

  it.effect("lets a recorder who never sits down record for everyone, and nothing more", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = openTable(starter.identity);
      expect(yield* starter.push(opened)).toEqual(["accepted"]);

      const { token } = yield* starter.client.recording.share({
        params: { tableId: opened.tableId },
      });

      const rae = yield* account("rae");
      const { player } = yield* rae.join(token, { id: PlayerId.make(uuid()), displayName: "Rae" });
      expect(
        yield* starter.push(
          recorderCommand("appoint_recorder", starter.identity, opened.tableId, player.id),
        ),
      ).toEqual(["accepted"]);
      const sam = seatNew(starter.identity, opened.tableId, "Sam");
      expect(yield* starter.push(sam)).toEqual(["accepted"]);

      expect(yield* rae.push(rebuy(rae.identity, sam.visitId))).toEqual(["accepted"]);
      const view = yield* rae.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("recorder");
      expect(view.visits.map((item) => item.visit.playerId)).toEqual([sam.playerId]);
      expect(
        (yield* rae.client.recording
          .share({ params: { tableId: opened.tableId } })
          .pipe(Effect.flip))._tag,
      ).toBe("Forbidden");
      expect(yield* rae.push(deleteTable(rae.identity, opened.tableId))).toEqual(["forbidden"]);
      const history = yield* rae.client.recording.history();
      expect(history.commands.map((command) => command.type)).toEqual([
        "open_table",
        "appoint_recorder",
        "join_table",
        "add",
      ]);
    }),
  );

  it.effect("keeps a table someone played at, even once they deleted their visit", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = openTable(starter.identity);
      const sat = sitDown(starter.identity, opened.tableId, starter.identity.playerId);
      expect(yield* starter.push(opened, sat)).toEqual(["accepted", "accepted"]);

      const removed = RecordingCommand.make({
        type: "delete_visit",
        operationId: RecordingOperationId.make(uuid()),
        actorId: starter.identity.actorId,
        preparedAt: sat.preparedAt,
        visitId: sat.visitId,
        expectedRevision: 0,
      });

      expect(yield* starter.push(removed)).toEqual(["accepted"]);
      expect(yield* starter.push(deleteTable(starter.identity, opened.tableId))).toEqual([
        "invalid",
      ]);
    }),
  );

  it.effect("deletes a table nobody played at, closing its link", () =>
    Effect.gen(function* () {
      const starter = yield* device();
      const opened = openTable(starter.identity);
      expect(yield* starter.push(opened)).toEqual(["accepted"]);

      const { token } = yield* starter.client.recording.share({
        params: { tableId: opened.tableId },
      });

      const other = yield* device();
      expect(yield* other.push(deleteTable(other.identity, opened.tableId))).toEqual(["forbidden"]);
      expect(yield* starter.push(deleteTable(starter.identity, opened.tableId))).toEqual([
        "accepted",
      ]);
      expect(yield* starter.push(deleteTable(starter.identity, opened.tableId))).toEqual([
        "invalid",
      ]);
      expect(yield* starter.push(seatNew(starter.identity, opened.tableId, "Sam"))).toEqual([
        "invalid",
      ]);
      expect(
        (yield* starter.client.recording
          .table({ params: { tableId: opened.tableId } })
          .pipe(Effect.flip))._tag,
      ).toBe("NotFound");
      expect((yield* other.join(token).pipe(Effect.flip))._tag).toBe("NotFound");
      const history = yield* starter.client.recording.history();
      expect(history.tables.find((table) => table.id === opened.tableId)?.deletedAt).toBeDefined();
    }),
  );
});
