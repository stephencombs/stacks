import { expect, it } from "@effect/vitest";
import { RecordingCommand, RecordingOperationId } from "@stacks/contracts/recordingCommands";
import * as Effect from "effect/Effect";

import {
  at,
  account,
  recorderCommand,
  correct,
  device,
  finish,
  seatNew,
  sharedTable,
  sitDown,
  start,
  uuid,
} from "../testing/recording.ts";
import { TestApi } from "../testing/TestApi.ts";
import { visitSummary } from "@stacks/shared/visits";

const lifecycle = (
  type: "delete_visit" | "restore_visit",
  actor: ReturnType<typeof start>["actorId"],
  visitId: ReturnType<typeof start>["visitId"],
  expectedRevision: number,
) =>
  RecordingCommand.make({
    type,
    operationId: RecordingOperationId.make(uuid()),
    actorId: actor,
    preparedAt: at(50),
    visitId,
    expectedRevision,
  });

it.layer(TestApi.layer, { timeout: "30 seconds" })("delete a session", (it) => {
  it.effect(
    "voids live facts, preserves corrections, and restores exact entries and totals idempotently",
    () =>
      Effect.gen(function* () {
        const me = yield* device();
        const opened = start(me.identity);
        const correction = correct(me.identity, opened.visitId, opened.buyInId);
        expect(yield* me.push(opened, correction, finish(me.identity, opened.visitId, 1))).toEqual([
          "accepted",
          "accepted",
          "accepted",
        ]);
        const before = yield* me.client.recording.history();
        const deleted = lifecycle("delete_visit", me.identity.actorId, opened.visitId, 2);
        expect(yield* me.push(deleted, deleted)).toEqual(["accepted", "accepted"]);
        const hidden = yield* me.client.recording.history();
        expect(hidden.visits[0]!.deletedAt).toEqual(deleted.preparedAt);
        expect(hidden.entries.every((entry) => entry.voidedAt !== null)).toBe(true);
        expect(hidden.entries.find((entry) => entry.id === opened.buyInId)).toEqual(
          before.entries.find((entry) => entry.id === opened.buyInId),
        );
        expect(visitSummary(hidden.visits[0]!, hidden.entries).totals).toEqual({
          buyIn: 0,
          cashOut: 0,
          adjustment: 0,
        });
        const restored = lifecycle("restore_visit", me.identity.actorId, opened.visitId, 3);
        expect(yield* me.push(restored, restored)).toEqual(["accepted", "accepted"]);
        const after = yield* me.client.recording.history();
        expect(after.entries).toEqual(before.entries);
        expect(after.visits).toEqual(
          before.visits.map((visit) => ({ ...visit, revision: visit.revision + 2 })),
        );
        expect(visitSummary(after.visits[0]!, after.entries).totals).toEqual(
          visitSummary(before.visits[0]!, before.entries).totals,
        );
      }),
  );

  it.effect("hides a sole player's table and share link until restoration", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const guest = yield* device();
      expect(
        yield* starter.push(lifecycle("delete_visit", starter.identity.actorId, opened.visitId, 0)),
      ).toEqual(["accepted"]);
      expect(
        (yield* starter.client.recording
          .table({ params: { tableId: opened.tableId } })
          .pipe(Effect.flip))._tag,
      ).toBe("NotFound");
      expect((yield* guest.join(token).pipe(Effect.flip))._tag).toBe("NotFound");
      expect(
        yield* starter.push(
          lifecycle("restore_visit", starter.identity.actorId, opened.visitId, 1),
        ),
      ).toEqual(["accepted"]);
      expect(
        (yield* starter.client.recording.table({ params: { tableId: opened.tableId } })).visits.map(
          (item) => item.visit.id,
        ),
      ).toEqual([opened.visitId]);
      expect((yield* guest.join(token)).table.id).toBe(opened.tableId);
    }),
  );

  it.effect("refuses deletion and restore through appointed recorder authority", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const recorder = yield* account("recorder");
      const { player } = yield* recorder.join(token);
      expect(
        yield* starter.push(
          recorderCommand("appoint_recorder", starter.identity, opened.tableId, player.id),
        ),
      ).toEqual(["accepted"]);
      const history = yield* recorder.client.recording.history();
      expect(history.ownedPlayerIds).toContain(player.id);
      expect(history.ownedPlayerIds).not.toContain(opened.playerId);
      expect(history.visits.some((visit) => visit.id === opened.visitId)).toBe(true);
      expect(
        yield* recorder.push(
          lifecycle("delete_visit", recorder.identity.actorId, opened.visitId, 0),
        ),
      ).toEqual(["forbidden"]);
      expect(
        yield* starter.push(lifecycle("delete_visit", starter.identity.actorId, opened.visitId, 0)),
      ).toEqual(["accepted"]);
      expect(
        yield* recorder.push(
          lifecycle("restore_visit", recorder.identity.actorId, opened.visitId, 1),
        ),
      ).toEqual(["forbidden"]);
    }),
  );

  it.effect("keeps others playing and refuses deletion or restore through starter authority", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const guest = yield* device();
      const joined = yield* guest.join(token);
      const seated = {
        ...sitDown(guest.identity, opened.tableId, joined.player.id),
        counterpartyId: starter.identity.playerId,
      };
      expect(yield* guest.push(seated)).toEqual(["accepted"]);
      const before = yield* starter.client.recording.history();
      expect(
        yield* starter.push(lifecycle("delete_visit", starter.identity.actorId, seated.visitId, 0)),
      ).toEqual(["forbidden"]);
      expect(
        yield* guest.push(lifecycle("delete_visit", guest.identity.actorId, seated.visitId, 0)),
      ).toEqual(["accepted"]);
      expect(
        yield* starter.push(
          lifecycle("restore_visit", starter.identity.actorId, seated.visitId, 1),
        ),
      ).toEqual(["forbidden"]);
      const hidden = yield* starter.client.recording.history();
      expect(hidden.entries.find((entry) => entry.visitId === seated.visitId)).toMatchObject({
        counterpartyId: starter.identity.playerId,
        voidReason: "Session deleted",
      });
      expect(hidden.entries.find((entry) => entry.visitId === opened.visitId)).toEqual(
        before.entries.find((entry) => entry.visitId === opened.visitId),
      );
      const view = yield* starter.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.visits.map((item) => item.visit.id)).toEqual([opened.visitId]);
      expect(
        yield* guest.push(lifecycle("restore_visit", guest.identity.actorId, seated.visitId, 1)),
      ).toEqual(["accepted"]);
      expect((yield* starter.client.recording.history()).entries).toEqual(before.entries);
    }),
  );

  it.effect(
    "refuses deleting a saved guest the starter records for, and refuses stale revisions",
    () =>
      Effect.gen(function* () {
        const me = yield* device();
        const opened = start(me.identity);
        expect(yield* me.push(opened)).toEqual(["accepted"]);
        const guest = seatNew(me.identity, opened.tableId, "Guest");
        expect(yield* me.push(guest)).toEqual(["accepted"]);
        expect(
          yield* me.push(lifecycle("delete_visit", me.identity.actorId, guest.visitId, 0)),
        ).toEqual(["forbidden"]);
        expect(
          yield* me.push(lifecycle("delete_visit", me.identity.actorId, opened.visitId, 1)),
        ).toEqual(["conflict"]);
        expect(
          yield* me.push(lifecycle("delete_visit", me.identity.actorId, opened.visitId, 0)),
        ).toEqual(["accepted"]);
        const back = sitDown(me.identity, opened.tableId, me.identity.playerId);
        expect(yield* me.push(back)).toEqual(["accepted"]);
        expect(
          yield* me.push(lifecycle("restore_visit", me.identity.actorId, opened.visitId, 1)),
        ).toEqual(["invalid"]);
        expect(yield* me.push(finish(me.identity, back.visitId))).toEqual(["accepted"]);
        expect(
          yield* me.push(lifecycle("restore_visit", me.identity.actorId, opened.visitId, 1)),
        ).toEqual(["accepted"]);
      }),
  );
});
