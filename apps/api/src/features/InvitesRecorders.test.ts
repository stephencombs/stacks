import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { PlayerId } from "@stacks/contracts";

import {
  account,
  correct,
  device,
  finish,
  rebuy,
  recorderCommand,
  seatNew,
  sharedTable,
  sitDown,
  uuid,
} from "../testing/recording.ts";
import { TestApi } from "../testing/TestApi.ts";

/** A shared table where the starter seated Bea by name, and an invite to record as her. */
const invitedTable = Effect.fn("test.invitedTable")(function* () {
  const table = yield* sharedTable();
  const seated = seatNew(table.starter.identity, table.opened.tableId, "Bea");
  expect(yield* table.starter.push(seated)).toEqual(["accepted"]);
  const invite = yield* table.starter.client.recording.invitePlayer({
    params: { playerId: seated.playerId },
  });
  return { ...table, seated, invite };
});

/** A shared table, and an account that joined it through the link. */
const tableWithAccount = Effect.fn("test.tableWithAccount")(function* () {
  const table = yield* sharedTable();
  const dee = yield* account("dee");
  const { player } = yield* dee.join(table.token, {
    id: PlayerId.make(uuid()),
    displayName: "Dee",
  });
  const sat = sitDown(dee.identity, table.opened.tableId, player.id);
  expect(yield* dee.push(sat)).toEqual(["accepted"]);
  return { ...table, dee, player, sat };
});

it.layer(TestApi.layer, { timeout: "30 seconds" })("invites and recorders", (it) => {
  it.effect("never lets a table link take over a player, and a bad link creates nothing", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, token, seated } = yield* invitedTable();
      const cal = yield* device();
      expect(
        yield* cal.join(token, { id: seated.playerId, displayName: "Bea" }).pipe(Effect.flip),
      ).toMatchObject({ _tag: "Conflict", reason: "id_taken" });
      expect(yield* cal.redeem(token).pipe(Effect.flip)).toMatchObject({
        _tag: "NotFound",
        resource: "invite",
      });
      expect(yield* sql`select 1 from player_actors where player_id = ${seated.playerId}`).toEqual(
        [],
      );

      const stray = yield* device();
      expect(yield* stray.join("not-a-link").pipe(Effect.flip)).toMatchObject({
        _tag: "NotFound",
        resource: "table",
      });
      expect(yield* sql`select 1 from players where id = ${stray.identity.playerId}`).toEqual([]);
      expect(yield* stray.redeem("not-a-link").pipe(Effect.flip)).toMatchObject({
        _tag: "NotFound",
      });
      expect(yield* sql`select 1 from players where id = ${stray.identity.playerId}`).toEqual([]);

      // Nobody can hand on a recorder's own player, not even the starter its own.
      expect(
        yield* starter.client.recording
          .invitePlayer({ params: { playerId: starter.identity.playerId } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "Forbidden", reason: "not_your_player" });
      expect(
        yield* cal.client.recording
          .invitePlayer({ params: { playerId: seated.playerId } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound", resource: "player" });
    }),
  );

  it.effect("redeems an invite once, as that player only", () =>
    Effect.gen(function* () {
      const { starter, opened, seated, invite } = yield* invitedTable();
      const anon = yield* TestApi.pipe(Effect.flatMap((api) => api.asActor(null)));
      const preview = yield* anon.publicRecording.previewInvite({
        params: { token: invite.token },
      });
      expect(preview.player).toEqual({ id: seated.playerId, displayName: "Bea" });

      const bea = yield* device();
      expect(yield* bea.redeem(invite.token)).toEqual({ id: seated.playerId, displayName: "Bea" });
      const cal = yield* device();
      expect(yield* cal.redeem(invite.token).pipe(Effect.flip)).toMatchObject({
        _tag: "Conflict",
        reason: "invite_used_up",
      });
      expect(
        yield* anon.publicRecording
          .previewInvite({ params: { token: invite.token } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "Conflict", reason: "invite_used_up" });

      // Bea's device records Bea's play, and nobody else's.
      const accepted = yield* bea.push(
        rebuy(bea.identity, seated.visitId),
        finish(bea.identity, seated.visitId, 1),
      );
      expect(accepted).toEqual(["accepted", "accepted"]);
      expect(yield* bea.push(rebuy(bea.identity, opened.visitId))).toEqual(["forbidden"]);
      expect(yield* bea.push(correct(bea.identity, opened.visitId, opened.buyInId))).toEqual([
        "forbidden",
      ]);
      expect(yield* bea.push(seatNew(bea.identity, opened.tableId, "Cal"))).toEqual(["forbidden"]);
      // Returning to the table is her own play too.
      expect(yield* bea.push(sitDown(bea.identity, opened.tableId, seated.playerId, 40))).toEqual([
        "accepted",
      ]);

      const history = yield* bea.client.recording.history();
      expect(history.tables.map((table) => table.id)).toEqual([opened.tableId]);
      expect(history.participants).toEqual([
        { tableId: opened.tableId, player: { id: seated.playerId, displayName: "Bea" } },
      ]);
      expect(history.visits.every((visit) => visit.playerId === seated.playerId)).toBe(true);
      const view = yield* bea.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("participant");
      expect(view.viewerPlayerId).toBe(seated.playerId);

      // The starter's device still sees Bea as the player it seated, not as someone who joined.
      const own = yield* starter.client.recording.history();
      expect(own.participants).toEqual([]);
    }),
  );

  it.effect("refuses a revoked invite, and a new invite revokes the last", () =>
    Effect.gen(function* () {
      const { starter, seated, invite } = yield* invitedTable();
      const next = yield* starter.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });
      const bea = yield* device();
      expect(yield* bea.redeem(invite.token).pipe(Effect.flip)).toMatchObject({
        _tag: "Conflict",
        reason: "invite_revoked",
      });
      const access = yield* starter.client.recording.playerAccess({
        params: { playerId: seated.playerId },
      });
      expect(access.invite?.id).toBe(next.id);

      yield* starter.client.recording.revokeInvite({ params: { inviteId: next.id } });
      expect(yield* bea.redeem(next.token).pipe(Effect.flip)).toMatchObject({
        _tag: "Conflict",
        reason: "invite_revoked",
      });
      expect(
        (yield* starter.client.recording.playerAccess({ params: { playerId: seated.playerId } }))
          .invite,
      ).toBeNull();
    }),
  );

  it.effect("lets a bound device invite another, and revoked bindings stop working", () =>
    Effect.gen(function* () {
      const { starter, opened, seated, invite } = yield* invitedTable();
      const bea = yield* device();
      yield* bea.redeem(invite.token);
      // Bea's phone invites her laptop.
      const laptop = yield* device();
      const second = yield* bea.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });
      yield* laptop.redeem(second.token);
      expect(yield* laptop.push(rebuy(laptop.identity, seated.visitId))).toEqual(["accepted"]);

      const access = yield* starter.client.recording.playerAccess({
        params: { playerId: seated.playerId },
      });
      expect(access.devices.map((item) => item.actorId).toSorted()).toEqual(
        [bea.identity.actorId, laptop.identity.actorId].toSorted(),
      );

      yield* starter.client.recording.revokeBinding({
        params: { playerId: seated.playerId, actorId: bea.identity.actorId },
      });
      expect(yield* bea.push(rebuy(bea.identity, seated.visitId, 1))).toEqual(["forbidden"]);
      expect(
        yield* bea.client.recording
          .table({ params: { tableId: opened.tableId } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound" });
      expect((yield* bea.client.recording.history()).tables).toEqual([]);
      expect(
        yield* bea.client.recording
          .invitePlayer({ params: { playerId: seated.playerId } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound" });
      // The laptop still records as Bea.
      expect(yield* laptop.push(rebuy(laptop.identity, seated.visitId, 1))).toEqual(["accepted"]);
    }),
  );

  it.effect("appoints only players with accounts as recorders", () =>
    Effect.gen(function* () {
      const { starter, opened, token, dee, player } = yield* tableWithAccount();
      const bea = yield* device();
      const { player: guest } = yield* bea.join(token);
      expect(
        yield* starter.push(
          recorderCommand("appoint_recorder", starter.identity, opened.tableId, guest.id),
        ),
      ).toEqual(["invalid"]);
      // Nor someone who isn't at the table.
      expect(
        yield* starter.push(
          recorderCommand(
            "appoint_recorder",
            starter.identity,
            opened.tableId,
            dee.identity.playerId,
          ),
        ),
      ).toEqual(["invalid"]);
      expect(
        yield* starter.push(
          recorderCommand("appoint_recorder", starter.identity, opened.tableId, player.id),
        ),
      ).toEqual(["accepted"]);

      const view = yield* starter.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.appointable).toEqual([player.id]);
      expect(view.recorders).toEqual([player.id]);
      expect(view.shared).toBe(true);
    }),
  );

  it.effect("lets a recorder record for everyone, but never share, appoint or unshare", () =>
    Effect.gen(function* () {
      const { starter, opened, token, dee, player, sat } = yield* tableWithAccount();
      const bea = yield* device();
      const { player: guest } = yield* bea.join(token);
      const beaSat = sitDown(bea.identity, opened.tableId, guest.id);
      yield* bea.push(beaSat);
      expect(
        yield* starter.push(
          recorderCommand("appoint_recorder", starter.identity, opened.tableId, player.id),
        ),
      ).toEqual(["accepted"]);

      expect(
        yield* dee.push(
          rebuy(dee.identity, opened.visitId),
          correct(dee.identity, beaSat.visitId, beaSat.buyInId),
          seatNew(dee.identity, opened.tableId, "Cal"),
          rebuy(dee.identity, sat.visitId),
        ),
      ).toEqual(["accepted", "accepted", "accepted", "accepted"]);

      const view = yield* dee.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("recorder");
      expect(view.appointable).toEqual([]);
      const history = yield* dee.client.recording.history();
      expect(history.visits.map((visit) => visit.id)).toContain(opened.visitId);
      expect(history.commands.map((command) => command.type)).toContain("appoint_recorder");

      const params = { params: { tableId: opened.tableId } };
      expect(yield* dee.client.recording.share(params).pipe(Effect.flip)).toMatchObject({
        _tag: "Forbidden",
        reason: "starter_only",
      });
      expect(yield* dee.client.recording.unshare(params).pipe(Effect.flip)).toMatchObject({
        _tag: "Forbidden",
        reason: "starter_only",
      });
      expect(
        yield* dee.push(
          recorderCommand("appoint_recorder", dee.identity, opened.tableId, guest.id),
          recorderCommand("revoke_recorder", dee.identity, opened.tableId, player.id),
        ),
      ).toEqual(["forbidden", "forbidden"]);
      expect(
        yield* dee.client.recording
          .invitePlayer({ params: { playerId: guest.id } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "NotFound" });
      // Recording repayments isn't part of table recording yet, so there's nothing to refuse.
    }),
  );

  it.effect("refuses a revoked recorder's later pushes and keeps what they recorded", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, opened, dee, player } = yield* tableWithAccount();
      const appoint = recorderCommand(
        "appoint_recorder",
        starter.identity,
        opened.tableId,
        player.id,
      );
      expect(yield* starter.push(appoint)).toEqual(["accepted"]);
      const before = rebuy(dee.identity, opened.visitId);
      expect(yield* dee.push(before)).toEqual(["accepted"]);

      expect(
        yield* starter.push(
          recorderCommand("revoke_recorder", starter.identity, opened.tableId, player.id),
        ),
      ).toEqual(["accepted"]);
      // Queued offline before Dee heard: refused in the server's order.
      expect(yield* dee.push(rebuy(dee.identity, opened.visitId, 1))).toEqual(["forbidden"]);

      const [entry] = yield* sql<{ createdBy: string; voidedAt: Date | null }>`
        select created_by, voided_at from personal_entries where id = ${before.entryId}
      `;
      expect(entry).toEqual({ createdBy: dee.identity.actorId, voidedAt: null });

      // Dee's device keeps the visit Dee recorded on, but no longer the whole table.
      const history = yield* dee.client.recording.history();
      expect(history.visits.map((visit) => visit.id)).toContain(opened.visitId);
      expect(history.commands.map((command) => command.operationId)).toContain(before.operationId);
      expect(history.commands.map((command) => command.type)).not.toContain("appoint_recorder");
      const view = yield* dee.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("participant");

      // Appointing again restores it.
      expect(
        yield* starter.push(
          recorderCommand("appoint_recorder", starter.identity, opened.tableId, player.id),
        ),
      ).toEqual(["accepted"]);
      expect(yield* dee.push(rebuy(dee.identity, opened.visitId, 1))).toEqual(["accepted"]);
    }),
  );

  it.effect("keeps starter authority across leaving and returning, and gives none to others", () =>
    Effect.gen(function* () {
      const { starter, opened, token } = yield* sharedTable();
      const bea = yield* device();
      const { player } = yield* bea.join(token);
      const first = sitDown(bea.identity, opened.tableId, player.id);
      expect(yield* bea.push(first, finish(bea.identity, first.visitId))).toEqual([
        "accepted",
        "accepted",
      ]);

      const back = sitDown(starter.identity, opened.tableId, starter.identity.playerId, 30);
      expect(yield* starter.push(finish(starter.identity, opened.visitId), back)).toEqual([
        "accepted",
        "accepted",
      ]);
      expect(yield* starter.push(rebuy(starter.identity, first.visitId, 1))).toEqual(["invalid"]); // Bea's visit has finished.
      const beaBack = sitDown(bea.identity, opened.tableId, player.id, 31);
      expect(yield* bea.push(beaBack)).toEqual(["accepted"]);
      expect(yield* starter.push(rebuy(starter.identity, beaBack.visitId))).toEqual(["accepted"]);
      const params = { params: { tableId: opened.tableId } };
      expect((yield* starter.client.recording.share(params)).token).not.toBe(token);

      expect(yield* bea.push(rebuy(bea.identity, back.visitId))).toEqual(["forbidden"]);
      expect(yield* bea.client.recording.share(params).pipe(Effect.flip)).toMatchObject({
        _tag: "Forbidden",
        reason: "starter_only",
      });
      expect((yield* bea.client.recording.table(params)).viewerRole).toBe("participant");
    }),
  );
});
