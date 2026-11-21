import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { PlayerId } from "@stacks/contracts";

import { groupWith, ids, users } from "../testing/fixtures.test-utils.ts";
import {
  device,
  rebuy,
  seatNew,
  sharedTable,
  signedIn,
  sitDown,
  start,
  uuid,
} from "../testing/recording.test-utils.ts";
import { TestApi } from "../testing/TestApi.test-utils.ts";
import * as Access from "./Access.ts";
import { digest } from "./Recording.ts";

const handle = (name: string) => `${name}_${uuid().slice(0, 8)}`;

const footprint = Effect.fn("test.footprint")(function* (players: ReadonlyArray<string>) {
  const sql = yield* SqlClient.SqlClient;
  const mine = sql.in(players);

  const [row] = yield* sql<{
    players: number;
    tables: number;
    visits: number;
    entries: number;
    operations: number;
  }>`
    select
      (select count(*) from players where id in ${mine})::int as players,
      (select count(*) from tables where starter_player_id in ${mine})::int as tables,
      (select count(*) from personal_visits where player_id in ${mine})::int as visits,
      (select count(*) from personal_entries e join personal_visits v on v.id = e.visit_id
        where v.player_id in ${mine})::int as entries,
      (select count(*) from personal_operations where player_id in ${mine})::int as operations
  `;

  return row!;
});

const owners = Effect.fn("test.owners")(function* (players: ReadonlyArray<string>) {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql<{ id: string; userId: string | null }>`
    select id, user_id from players where id in ${sql.in(players)}
  `;

  return Object.fromEntries(rows.map((row) => [row.id, row.userId]));
});

const invitedPlayer = Effect.fn("test.invitedPlayer")(function* (name = "Bea") {
  const table = yield* sharedTable();
  const seated = seatNew(table.starter.identity, table.opened.tableId, name);
  expect(yield* table.starter.push(seated)).toEqual(["accepted"]);

  const invite = yield* table.starter.client.recording.invitePlayer({
    params: { playerId: seated.playerId },
  });

  return { ...table, seated, invite };
});

const joined = Effect.fn("test.joined")(function* (
  table: Effect.Success<ReturnType<typeof sharedTable>>,
  displayName = "Bea",
) {
  const recorder = yield* device();

  const { player } = yield* recorder.join(table.token, {
    id: PlayerId.make(uuid()),
    displayName,
  });

  const sat = sitDown(recorder.identity, table.opened.tableId, player.id);
  expect(yield* recorder.push(sat)).toEqual(["accepted"]);

  return { recorder, player, sat };
});

it.layer(TestApi.layer)("claiming guest history", (it) => {
  it.effect("claims what a device holds without copying any of its history", () =>
    Effect.gen(function* () {
      const table = yield* sharedTable();
      const { starter, opened } = table;
      const { recorder: guest, player, sat } = yield* joined(table);
      expect(yield* guest.push(rebuy(guest.identity, sat.visitId))).toEqual(["accepted"]);

      const players = [starter.identity.playerId, guest.identity.playerId, player.id];
      const before = yield* footprint(players);
      expect(before).toMatchObject({ players: 3, tables: 1, visits: 2, entries: 3 });

      const alex = yield* signedIn(handle("alex"), guest.identity);
      const result = yield* alex.client.claim.claimActor({ payload: guest.credential });
      expect(result.adopted).toBe(true);
      expect(result.refused).toEqual([]);
      expect(result.claimed.map((item) => item.id).toSorted()).toEqual(
        [guest.identity.playerId, player.id].toSorted(),
      );
      expect(yield* footprint(players)).toEqual(before);

      const held = yield* owners(players);
      expect(held[starter.identity.playerId]).toBeNull();
      expect(held[player.id]).not.toBeNull();
      expect(held[player.id]).toBe(held[guest.identity.playerId]);

      const history = yield* alex.client.recording.history();
      expect(history.identity).toEqual(guest.identity);
      expect(history.tables.map((item) => item.id)).toEqual([opened.tableId]);
      expect(history.participants).toEqual([
        { tableId: opened.tableId, player: { id: player.id, displayName: "Bea" } },
      ]);
      expect(history.visits.map((visit) => visit.id)).toEqual([sat.visitId]);
      expect(history.entries).toHaveLength(2);

      expect(yield* alex.push(rebuy(guest.identity, sat.visitId, 1))).toEqual(["accepted"]);
      expect(yield* alex.push(rebuy(guest.identity, opened.visitId))).toEqual(["forbidden"]);
      expect(yield* alex.client.claim.claimActor({ payload: guest.credential })).toEqual({
        adopted: false,
        claimed: [],
        refused: [],
      });

      const stranger = yield* signedIn(handle("cal"));
      expect(yield* stranger.push(start(stranger.identity))).toEqual(["accepted"]);
      const theirs = yield* stranger.client.recording.history();
      expect(theirs.tables.map((item) => item.id)).not.toContain(opened.tableId);
      expect(theirs.visits.map((visit) => visit.id)).not.toContain(sat.visitId);
      expect(
        (yield* stranger.client.recording
          .table({ params: { tableId: opened.tableId } })
          .pipe(Effect.flip))._tag,
      ).toBe("NotFound");
    }),
  );

  it.effect("won't claim a player another device holds, with or without its secret", () =>
    Effect.gen(function* () {
      const table = yield* sharedTable();
      const { recorder: holder, player } = yield* joined(table);
      const seated = seatNew(table.starter.identity, table.opened.tableId, "Cal");
      expect(yield* table.starter.push(seated)).toEqual(["accepted"]);
      const thief = yield* device();
      expect(yield* thief.push(start(thief.identity))).toEqual(["accepted"]);
      const alex = yield* signedIn(handle("alex"));

      expect(
        (yield* alex.client.claim
          .claimActor({
            payload: { actorId: holder.identity.actorId, secret: thief.credential.secret },
          })
          .pipe(Effect.flip))._tag,
      ).toBe("Unauthorized");
      const result = yield* alex.client.claim.claimActor({ payload: thief.credential });
      expect(result.claimed.map((item) => item.id)).toEqual([thief.identity.playerId]);
      {
        const received = yield* alex.redeem("not-an-invite").pipe(Effect.flip);
        expect(received._tag).toBe("NotFound");
        expect(received).toMatchObject({ resource: "invite" });
      }

      expect(yield* owners([player.id, seated.playerId])).toEqual({
        [player.id]: null,
        [seated.playerId]: null,
      });
      const history = yield* alex.client.recording.history();
      expect(history.tables.map((item) => item.id)).not.toContain(table.opened.tableId);
    }),
  );

  it.effect("never links guests just because their names match", () =>
    Effect.gen(function* () {
      const table = yield* sharedTable();
      const seated = seatNew(table.starter.identity, table.opened.tableId, "Bea");
      expect(yield* table.starter.push(seated)).toEqual(["accepted"]);
      const first = yield* joined(table, "Bea");
      const second = yield* joined(table, "Bea");

      const alex = yield* signedIn(handle("alex"), first.recorder.identity);
      const result = yield* alex.client.claim.claimActor({ payload: first.recorder.credential });
      expect(result.claimed.map((item) => item.id)).toContain(first.player.id);
      const held = yield* owners([first.player.id, second.player.id, seated.playerId]);
      expect(held[first.player.id]).not.toBeNull();
      expect(held[second.player.id]).toBeNull();
      expect(held[seated.playerId]).toBeNull();

      const history = yield* alex.client.recording.history();
      expect(history.visits.map((visit) => visit.id)).toEqual([first.sat.visitId]);
      expect(history.visits.map((visit) => visit.playerId)).not.toContain(second.player.id);
    }),
  );

  it.effect("claims a player by invite while signed in, and refuses another account's", () =>
    Effect.gen(function* () {
      const { starter, seated, invite } = yield* invitedPlayer();
      const before = yield* footprint([seated.playerId]);
      const name = handle("alex");
      const alex = yield* signedIn(name);
      expect(yield* alex.redeem(invite.token)).toEqual({ id: seated.playerId, displayName: "Bea" });
      expect(yield* footprint([seated.playerId])).toEqual(before);

      const held = yield* owners([seated.playerId, alex.identity.playerId]);
      expect(held[seated.playerId]).not.toBeNull();
      expect(held[seated.playerId]).toBe(held[alex.identity.playerId]);
      const history = yield* alex.client.recording.history();
      expect(history.visits.map((visit) => visit.id)).toEqual([seated.visitId]);
      expect(history.participants).toHaveLength(1);
      const other = yield* signedIn(name, alex.identity);
      expect((yield* other.client.recording.history()).visits.map((visit) => visit.id)).toEqual([
        seated.visitId,
      ]);
      expect(yield* other.push(rebuy(other.identity, seated.visitId))).toEqual(["accepted"]);

      const next = yield* starter.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });

      const eve = yield* signedIn(handle("eve"));
      {
        const received = yield* eve.redeem(next.token).pipe(Effect.flip);
        expect(received._tag).toBe("Conflict");
        expect(received).toMatchObject({ reason: "player_claimed" });
      }

      const sql = yield* SqlClient.SqlClient;
      expect(yield* sql`select 1 from players where id = ${eve.identity.playerId}`).toEqual([]);
      expect(
        yield* sql`select 1 from player_invites where id = ${next.id} and redeemed_at is null`,
      ).toHaveLength(1);
      expect((yield* owners([seated.playerId]))[seated.playerId]).toBe(held[seated.playerId]);
      expect((yield* eve.client.recording.history()).visits.map((visit) => visit.id)).not.toContain(
        seated.visitId,
      );
    }),
  );

  it.effect("claims a player by joining a table while signed in", () =>
    Effect.gen(function* () {
      const table = yield* sharedTable();
      const dee = yield* signedIn(handle("dee"));

      const { player } = yield* dee.join(table.token, {
        id: PlayerId.make(uuid()),
        displayName: "Dee",
      });

      const held = yield* owners([player.id, dee.identity.playerId]);
      expect(held[player.id]).not.toBeNull();
      expect(held[player.id]).toBe(held[dee.identity.playerId]);
    }),
  );

  it.effect("links several players to one account without merging any, one personal player", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const name = handle("alex");
      const alex = yield* signedIn(name);
      expect(yield* alex.push(start(alex.identity))).toEqual(["accepted"]);
      const first = yield* invitedPlayer("Bea");
      const second = yield* invitedPlayer("Cal");
      const players = [first.seated.playerId, second.seated.playerId];
      const before = yield* footprint(players);
      yield* alex.redeem(first.invite.token);
      yield* alex.redeem(second.invite.token);
      expect(yield* footprint(players)).toEqual(before);

      const held = yield* owners([...players, alex.identity.playerId]);
      expect(new Set(Object.values(held)).size).toBe(1);
      expect(held[alex.identity.playerId]).not.toBeNull();
      expect(
        yield* sql`select 1 from players where user_id = ${held[alex.identity.playerId]!}
          and recording_actor_id is not null`,
      ).toHaveLength(1);
      expect(
        yield* sql`select 1 from players where user_id = ${held[alex.identity.playerId]!}`,
      ).toHaveLength(3);

      const history = yield* alex.client.recording.history();
      expect(history.visits.map((visit) => visit.playerId).toSorted()).toEqual(
        [alex.identity.playerId, ...players].toSorted(),
      );
      expect(history.participants.map((item) => item.player.id).toSorted()).toEqual(
        players.toSorted(),
      );
    }),
  );

  it.effect("keeps an account's own player apart from a device's until they're linked", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const name = handle("alex");
      const alex = yield* signedIn(name);
      expect(yield* alex.push(start(alex.identity))).toEqual(["accepted"]);
      const phone = yield* device();
      const opened = start(phone.identity);
      expect(yield* phone.push(opened)).toEqual(["accepted"]);
      const table = yield* sharedTable();
      const { player } = yield* joined(table, "Bea");

      {
        const received = yield* alex.client.claim
          .claimActor({ payload: phone.credential })
          .pipe(Effect.flip);

        expect(received._tag).toBe("Conflict");
        expect(received).toMatchObject({ reason: "recording_identity" });
      }

      expect((yield* owners([phone.identity.playerId]))[phone.identity.playerId]).toBeNull();
      expect((yield* alex.client.recording.history()).tables.map((item) => item.id)).not.toContain(
        opened.tableId,
      );

      const before = yield* footprint([phone.identity.playerId, alex.identity.playerId]);

      const linked = yield* alex.client.claim.claimActor({
        payload: { ...phone.credential, link: true },
      });

      expect(linked).toEqual({
        adopted: false,
        claimed: [{ id: phone.identity.playerId, displayName: "Starter" }],
        refused: [],
      });
      expect(yield* footprint([phone.identity.playerId, alex.identity.playerId])).toEqual(before);
      const held = yield* owners([phone.identity.playerId, alex.identity.playerId, player.id]);
      expect(held[phone.identity.playerId]).toBe(held[alex.identity.playerId]);
      expect(held[player.id]).toBeNull();
      expect(
        yield* sql`select 1 from players where user_id = ${held[alex.identity.playerId]!}
          and recording_actor_id is not null`,
      ).toHaveLength(1);

      const history = yield* alex.client.recording.history();
      expect(history.identity).toEqual(alex.identity);
      expect(history.tables.map((item) => item.id)).toContain(opened.tableId);

      expect(yield* phone.push(rebuy(phone.identity, opened.visitId))).toEqual(["accepted"]);
      expect(
        (yield* alex.client.recording.history()).entries.filter(
          (entry) => entry.visitId === opened.visitId,
        ),
      ).toHaveLength(2);
      expect(yield* alex.client.claim.claimActor({ payload: phone.credential })).toMatchObject({
        claimed: [],
      });

      const cal = yield* signedIn(handle("cal"));
      {
        const received = yield* cal.client.claim
          .claimActor({ payload: phone.credential })
          .pipe(Effect.flip);

        expect(received._tag).toBe("Conflict");
        expect(received).toMatchObject({ reason: "player_claimed" });
      }

      const laptop = yield* signedIn(name, alex.identity);
      expect(
        (yield* laptop.client.recording.table({ params: { tableId: opened.tableId } })).viewerRole,
      ).toBe("starter");
      expect(yield* laptop.push(seatNew(alex.identity, opened.tableId, "Dee"))).toEqual([
        "accepted",
      ]);
    }),
  );

  it.effect("lets a signed-up starter recover their table from a new device", () =>
    Effect.gen(function* () {
      const table = yield* sharedTable();
      const { starter, opened } = table;
      const name = handle("alex");
      const alex = yield* signedIn(name, starter.identity);
      expect((yield* alex.client.claim.claimActor({ payload: starter.credential })).adopted).toBe(
        true,
      );
      expect((yield* starter.client.recording.history().pipe(Effect.flip))._tag).toBe(
        "Unauthorized",
      );

      const fresh = yield* signedIn(name, starter.identity);
      const view = yield* fresh.client.recording.table({ params: { tableId: opened.tableId } });
      expect(view.viewerRole).toBe("starter");
      expect(view.shared).toBe(true);
      expect(yield* fresh.push(seatNew(starter.identity, opened.tableId, "Cal"))).toEqual([
        "accepted",
      ]);
      yield* fresh.client.recording.unshare({ params: { tableId: opened.tableId } });
      expect(
        (yield* fresh.client.recording.table({ params: { tableId: opened.tableId } })).shared,
      ).toBe(false);

      const stranger = yield* signedIn(handle("eve"));
      expect(
        (yield* stranger.client.recording
          .table({ params: { tableId: opened.tableId } })
          .pipe(Effect.flip))._tag,
      ).toBe("NotFound");
    }),
  );

  it.effect("won't claim a binding the starter revoked, and releases one revoked afterwards", () =>
    Effect.gen(function* () {
      const first = yield* invitedPlayer("Bea");
      const stale = yield* device();
      yield* stale.redeem(first.invite.token);
      yield* first.starter.client.recording.revokeBinding({
        params: { playerId: first.seated.playerId, actorId: stale.identity.actorId },
      });
      const alex = yield* signedIn(handle("alex"), stale.identity);
      const result = yield* alex.client.claim.claimActor({ payload: stale.credential });
      expect(result.claimed.map((item) => item.id)).toEqual([stale.identity.playerId]);
      expect((yield* owners([first.seated.playerId]))[first.seated.playerId]).toBeNull();
      expect(
        (yield* alex.client.recording.history()).visits.map((visit) => visit.id),
      ).not.toContain(first.seated.visitId);

      const second = yield* invitedPlayer("Cal");
      const held = yield* device();
      yield* held.redeem(second.invite.token);
      const dee = yield* signedIn(handle("dee"), held.identity);
      const claimed = yield* dee.client.claim.claimActor({ payload: held.credential });
      expect(claimed.claimed.map((item) => item.id).toSorted()).toEqual(
        [held.identity.playerId, second.seated.playerId].toSorted(),
      );
      expect((yield* dee.client.recording.history()).visits.map((visit) => visit.id)).toContain(
        second.seated.visitId,
      );
      yield* second.starter.client.recording.revokeBinding({
        params: { playerId: second.seated.playerId, actorId: held.identity.actorId },
      });
      expect((yield* owners([second.seated.playerId]))[second.seated.playerId]).toBeNull();
      expect((yield* dee.client.recording.history()).visits.map((visit) => visit.id)).not.toContain(
        second.seated.visitId,
      );
    }),
  );

  it.effect("refuses a player already claimed by a different account", () =>
    Effect.gen(function* () {
      const { starter, seated, invite } = yield* invitedPlayer("Bea");
      const phone = yield* device();
      yield* phone.redeem(invite.token);

      const next = yield* starter.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });

      const alex = yield* signedIn(handle("alex"));
      yield* alex.redeem(next.token);
      const owner = (yield* owners([seated.playerId]))[seated.playerId];
      expect(owner).not.toBeNull();

      const dee = yield* signedIn(handle("dee"), phone.identity);
      const result = yield* dee.client.claim.claimActor({ payload: phone.credential });
      expect(result.refused).toEqual([{ id: seated.playerId, displayName: "Bea" }]);
      expect(result.claimed.map((item) => item.id)).toEqual([phone.identity.playerId]);
      expect((yield* owners([seated.playerId]))[seated.playerId]).toBe(owner);
      expect((yield* dee.client.recording.history()).visits.map((visit) => visit.id)).not.toContain(
        seated.visitId,
      );
      expect((yield* alex.client.recording.history()).visits.map((visit) => visit.id)).toContain(
        seated.visitId,
      );
      expect(yield* dee.push(rebuy(phone.identity, seated.visitId))).toEqual(["forbidden"]);
    }),
  );

  it.effect("links without touching bindings the account already has or the starter revoked", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, seated, invite } = yield* invitedPlayer("Bea");
      const alex = yield* signedIn(handle("alex"));
      expect(yield* alex.push(start(alex.identity))).toEqual(["accepted"]);
      yield* alex.redeem(invite.token);
      const phone = yield* device();

      const next = yield* starter.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });

      yield* phone.redeem(next.token);

      const binding = sql`
        select revoked_at, bound_via, invited_by_actor from player_actors
        where player_id = ${seated.playerId} and actor_id = ${alex.identity.actorId}
      `;

      const held = yield* binding;
      expect(held).toHaveLength(1);
      yield* alex.client.claim.claimActor({ payload: { ...phone.credential, link: true } });
      expect(yield* binding).toEqual(held);

      yield* starter.client.recording.revokeBinding({
        params: { playerId: seated.playerId, actorId: alex.identity.actorId },
      });
      expect((yield* owners([seated.playerId]))[seated.playerId]).toBeNull();

      const again = yield* alex.client.claim.claimActor({
        payload: { ...phone.credential, link: true },
      });

      expect(again.claimed.map((item) => item.id)).not.toContain(seated.playerId);
      expect((yield* binding)[0]!.revokedAt).not.toBeNull();
      expect((yield* owners([seated.playerId]))[seated.playerId]).toBeNull();
      expect(
        (yield* alex.client.recording.history()).visits.map((visit) => visit.id),
      ).not.toContain(seated.visitId);
    }),
  );

  it.effect("won't link past the cap on devices recording as one player", () =>
    Effect.gen(function* () {
      const { starter, seated, invite } = yield* invitedPlayer("Bea");
      const phone = yield* device();
      yield* phone.redeem(invite.token);

      for (let held = 1; held < 5; held += 1) {
        const next = yield* starter.client.recording.invitePlayer({
          params: { playerId: seated.playerId },
        });

        yield* (yield* device()).redeem(next.token);
      }

      const alex = yield* signedIn(handle("alex"));
      expect(yield* alex.push(start(alex.identity))).toEqual(["accepted"]);

      const result = yield* alex.client.claim.claimActor({
        payload: { ...phone.credential, link: true },
      });

      expect(result.claimed.map((item) => item.id)).toEqual([phone.identity.playerId]);
      expect((yield* owners([seated.playerId]))[seated.playerId]).toBeNull();
      const sql = yield* SqlClient.SqlClient;
      expect(
        yield* sql`
          select 1 from player_actors
          where player_id = ${seated.playerId} and actor_id = ${alex.identity.actorId}
        `,
      ).toEqual([]);
    }),
  );

  it.effect("leaves no claim on a player whose binding a revoke ended at the same time", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      for (let round = 0; round < 12; round += 1) {
        const { starter, seated, invite } = yield* invitedPlayer("Bea");
        const phone = yield* device();
        yield* phone.redeem(invite.token);
        const alex = yield* signedIn(handle("alex"), phone.identity);
        yield* Effect.all(
          [
            alex.client.claim.claimActor({ payload: phone.credential }),
            starter.client.recording.revokeBinding({
              params: { playerId: seated.playerId, actorId: phone.identity.actorId },
            }),
          ],
          { concurrency: "unbounded" },
        ).pipe(Effect.exit);

        const [row] = yield* sql<{ userId: string | null; live: boolean }>`
          select p.user_id, exists (
            select 1 from player_actors pa join players own on own.recording_actor_id = pa.actor_id
            where pa.player_id = p.id and pa.revoked_at is null and own.user_id = p.user_id
          ) as live
          from players p where p.id = ${seated.playerId}
        `;

        expect(row!.userId === null || row!.live).toBe(true);
      }
    }),
  );

  it.effect("lets only one of two accounts redeeming at once claim the player", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { starter, seated, invite } = yield* invitedPlayer("Bea");
      const phone = yield* device();
      yield* phone.redeem(invite.token);

      const first = yield* starter.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });

      const second = yield* phone.client.recording.invitePlayer({
        params: { playerId: seated.playerId },
      });

      const alex = yield* signedIn(handle("alex"));
      const bea = yield* signedIn(handle("bea"));

      const outcomes = yield* Effect.all(
        [alex.redeem(first.token), bea.redeem(second.token)].map((redeem) =>
          redeem.pipe(
            Effect.as("claimed"),
            Effect.catchTag("Conflict", (conflict) => Effect.succeed(conflict.reason)),
          ),
        ),
        { concurrency: "unbounded" },
      );

      expect(outcomes.toSorted()).toEqual(["claimed", "player_claimed"]);
      const winner = outcomes[0] === "claimed" ? alex : bea;
      const owner = yield* owners([seated.playerId, winner.identity.playerId]);
      expect(owner[seated.playerId]).toBe(owner[winner.identity.playerId]);
      expect(
        yield* sql`select 1 from players where user_id = ${owner[seated.playerId]!} and id = ${seated.playerId}`,
      ).toHaveLength(1);
    }),
  );

  it.effect("keeps the legacy group claim and the table claims apart", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, gus } = yield* users("alex", "gus");

      const table = yield* sharedTable();
      const { player } = yield* joined(table, "Bea");
      const tableCode = Access.randomCode();
      yield* sql`update players set claim_code = ${tableCode} where id = ${player.id}`;
      {
        const received = yield* gus.guests
          .previewClaim({ params: { code: tableCode } })
          .pipe(Effect.flip);

        expect(received._tag).toBe("NotFound");
        expect(received).toMatchObject({ resource: "claim" });
      }

      {
        const received = yield* gus.guests.claim({ params: { code: tableCode } }).pipe(Effect.flip);
        expect(received._tag).toBe("NotFound");
        expect(received).toMatchObject({ resource: "claim" });
      }

      expect((yield* owners([player.id]))[player.id]).toBeNull();

      const group = yield* groupWith(alex);
      const guestId = ids.player();

      const withGuest = yield* alex.guests.add({
        params: { groupId: group.group.id },
        payload: { id: guestId, displayName: "Gus" },
      });

      const code = withGuest.players.find((item) => item.id === guestId)!.claimCode!;
      const issuer = yield* device();
      const token = `legacy-guest-${uuid()}`;
      yield* sql`
        insert into player_invites (id, player_id, token_hash, issued_by_actor)
        values (${uuid()}, ${guestId}, ${yield* digest(token)}, ${issuer.identity.actorId})
      `;
      const dee = yield* signedIn(handle("dee"));
      {
        const received = yield* dee.redeem(token).pipe(Effect.flip);
        expect(received._tag).toBe("NotFound");
        expect(received).toMatchObject({ resource: "invite" });
      }

      const api = yield* TestApi;
      const anonymous = yield* api.asActor(null);
      expect(
        (yield* anonymous.publicRecording.previewInvite({ params: { token } }).pipe(Effect.flip))
          ._tag,
      ).toBe("NotFound");
      expect((yield* owners([guestId]))[guestId]).toBeNull();
      expect(yield* sql`select 1 from player_actors where player_id = ${guestId}`).toEqual([]);

      {
        const received = yield* gus.groups
          .get({ params: { groupId: group.group.id } })
          .pipe(Effect.flip);

        expect(received._tag).toBe("Forbidden");
        expect(received).toMatchObject({ reason: "not_a_member" });
      }

      const claimed = yield* gus.guests.claim({ params: { code } });
      expect(claimed.myPlayerId).toBe(guestId);
      expect(claimed.role).toBe("member");
      const hal = yield* users("hal");
      {
        const received = yield* hal.hal.guests.claim({ params: { code } }).pipe(Effect.flip);
        expect(received._tag).toBe("NotFound");
        expect(received).toMatchObject({ resource: "claim" });
      }

      expect((yield* gus.recording.history()).identity).toBeNull();
      const phone = yield* device();
      expect(yield* phone.push(start(phone.identity))).toEqual(["accepted"]);
      expect((yield* gus.claim.claimActor({ payload: phone.credential })).adopted).toBe(true);
      const owner = (yield* owners([guestId]))[guestId]!;
      expect(
        yield* sql`select 1 from players where user_id = ${owner} and recording_actor_id is not null`,
      ).toHaveLength(1);
      expect(
        yield* sql`select 1 from players where id = ${guestId} and group_id is not null
          and recording_actor_id is null`,
      ).toHaveLength(1);
    }),
  );
});
