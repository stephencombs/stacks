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
      // The laptop Bea invited goes with her.
      expect(yield* laptop.push(rebuy(laptop.identity, seated.visitId, 1))).toEqual(["forbidden"]);
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

  it.effect("stops a revoked device's earlier invites, and re-checks the issuer on redeem", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, seated, invite } = yield* invitedTable();
      const bea = yield* device();
      yield* bea.redeem(invite.token);
      const spare = yield* bea.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });
      yield* starter.client.recording.revokeBinding({
        params: { playerId: seated.playerId, actorId: bea.identity.actorId },
      });
      const thief = yield* device();
      expect(yield* thief.redeem(spare.token).pipe(Effect.flip)).toMatchObject({
        _tag: "Conflict",
        reason: "invite_revoked",
      });

      // An invite whose issuer lost authority some other way fails on redeem too.
      const laptop = yield* device();
      yield* laptop.redeem(
        (yield* starter.client.recording.invitePlayer({ params: { playerId: seated.playerId } }))
          .token,
      );
      const late = yield* laptop.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });
      yield* sql`
        update player_actors set revoked_at = now()
        where actor_id = ${laptop.identity.actorId} and player_id = ${seated.playerId}
      `;
      expect(yield* thief.redeem(late.token).pipe(Effect.flip)).toMatchObject({
        _tag: "Conflict",
        reason: "invite_revoked",
      });
      expect(
        yield* sql`select 1 from player_actors where player_id = ${seated.playerId} and actor_id = ${thief.identity.actorId}`,
      ).toEqual([]);
    }),
  );

  it.effect("lets a bound device only move itself, never manage others", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, seated, invite } = yield* invitedTable();
      const bea = yield* device();
      yield* bea.redeem(invite.token);
      const fromStarter = yield* starter.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });
      // Bea's own invite doesn't cancel the starter's.
      const fromBea = yield* bea.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });
      const laptop = yield* device();
      yield* laptop.redeem(fromStarter.token);
      const params = { params: { playerId: seated.playerId } };
      expect(
        yield* bea.client.recording
          .revokeBinding({ params: { ...params.params, actorId: laptop.identity.actorId } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "Forbidden" });
      expect(
        yield* bea.client.recording
          .revokeInvite({ params: { inviteId: fromBea.id } })
          .pipe(Effect.flip),
      ).toMatchObject({ _tag: "Forbidden" });
      expect(yield* bea.client.recording.playerAccess(params).pipe(Effect.flip)).toMatchObject({
        _tag: "Forbidden",
      });
      // Bea may stop her own device.
      yield* bea.client.recording.revokeBinding({
        params: { ...params.params, actorId: bea.identity.actorId },
      });
      // Her unused invite went with it.
      const [row] = yield* sql<{ revokedAt: Date | null }>`
        select revoked_at from player_invites where id = ${fromBea.id}
      `;
      expect(row?.revokedAt).not.toBeNull();
    }),
  );

  it.effect("restores a revoked binding as an invite, and previews the issuer only", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, opened, token } = yield* sharedTable();
      const bea = yield* device();
      const { player } = yield* bea.join(token);
      yield* bea.push(sitDown(bea.identity, opened.tableId, player.id));
      yield* starter.client.recording.revokeBinding({
        params: { playerId: player.id, actorId: bea.identity.actorId },
      });
      const again = yield* starter.client.recording.invitePlayer({
        params: { playerId: player.id },
      });
      const anon = yield* TestApi.pipe(Effect.flatMap((api) => api.asActor(null)));
      const preview = yield* anon.publicRecording.previewInvite({ params: { token: again.token } });
      expect(preview.invitedBy).toBe("Starter");
      yield* bea.redeem(again.token);
      const [binding] = yield* sql<{ boundVia: string; revokedAt: Date | null }>`
        select bound_via, revoked_at from player_actors
        where player_id = ${player.id} and actor_id = ${bea.identity.actorId}
      `;
      expect(binding).toEqual({ boundVia: "invite", revokedAt: null });

      // A used link creates nothing for whoever tries it next.
      const stray = yield* device();
      expect(yield* stray.redeem(again.token).pipe(Effect.flip)).toMatchObject({
        reason: "invite_used_up",
      });
      expect(yield* sql`select 1 from players where id = ${stray.identity.playerId}`).toEqual([]);
    }),
  );

  it.effect("revokes everything a revoked device invited, however far it reached", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, seated, invite } = yield* invitedTable();
      const params = { params: { playerId: seated.playerId } };
      const phone = yield* device();
      yield* phone.redeem(invite.token);
      const laptop = yield* device();
      yield* laptop.redeem((yield* phone.client.recording.invitePlayer(params)).token);
      const tablet = yield* device();
      yield* tablet.redeem((yield* laptop.client.recording.invitePlayer(params)).token);
      const pending = yield* tablet.client.recording.invitePlayer(params);
      // Someone the starter invited directly is untouched.
      const other = yield* device();
      yield* other.redeem((yield* starter.client.recording.invitePlayer(params)).token);

      yield* starter.client.recording.revokeBinding({
        params: { playerId: seated.playerId, actorId: phone.identity.actorId },
      });
      for (const revoked of [phone, laptop, tablet])
        expect(yield* revoked.push(rebuy(revoked.identity, seated.visitId))).toEqual(["forbidden"]);
      expect(yield* other.push(rebuy(other.identity, seated.visitId))).toEqual(["accepted"]);
      const [row] = yield* sql<{ revokedAt: Date | null }>`
        select revoked_at from player_invites where id = ${pending.id}
      `;
      expect(row?.revokedAt).not.toBeNull();
    }),
  );

  it.effect("caps the devices recording as one player", () =>
    Effect.gen(function* () {
      const { starter, seated } = yield* invitedTable();
      const params = { params: { playerId: seated.playerId } };
      for (let index = 0; index < 5; index++) {
        const next = yield* device();
        yield* next.redeem((yield* starter.client.recording.invitePlayer(params)).token);
      }
      const sixth = yield* device();
      const link = yield* starter.client.recording.invitePlayer(params);
      expect(yield* sixth.redeem(link.token).pipe(Effect.flip)).toMatchObject({
        _tag: "Conflict",
        reason: "too_many_devices",
      });
    }),
  );

  it.effect("never leaves a device bound when its issuer is revoked as it redeems", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      for (let round = 0; round < 5; round++) {
        const { starter, seated, invite } = yield* invitedTable();
        const bea = yield* device();
        yield* bea.redeem(invite.token);
        const link = yield* bea.client.recording.invitePlayer({
          params: { playerId: seated.playerId },
        });
        const thief = yield* device();
        // Register the thief's identity first so both requests only touch the invite.
        yield* thief.push(rebuy(thief.identity, seated.visitId)).pipe(Effect.ignore);
        yield* Effect.all(
          [
            thief.redeem(link.token).pipe(Effect.ignore),
            starter.client.recording.revokeBinding({
              params: { playerId: seated.playerId, actorId: bea.identity.actorId },
            }),
          ],
          { concurrency: "unbounded" },
        );
        expect(
          yield* sql`
            select 1 from player_actors
            where player_id = ${seated.playerId} and revoked_at is null
              and actor_id in (${bea.identity.actorId}, ${thief.identity.actorId})
          `,
        ).toEqual([]);
      }
    }),
  );
});
