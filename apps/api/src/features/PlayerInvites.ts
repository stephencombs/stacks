import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  Forbidden,
  NotFound,
  PlayerIdentity,
  PlayerInviteId,
  type ActorId,
  type PlayerId,
} from "@stacks/contracts";
import type {
  PlayerAccess,
  PlayerInviteLink,
  PlayerInvitePreview,
  RedeemInviteRequest,
} from "@stacks/contracts/recordingCommands";

import { PlayerIdentityRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import { digest, establish, principal, randomToken } from "./Recording.ts";

/** The most devices, besides an actor's own, that may record as one player at once. */
const MAX_DEVICES = 5;

/**
 * Revoking and redeeming both lock the player first, then its invites and bindings, so they
 * serialize on the player instead of racing or deadlocking.
 */
const lockPlayer = (sql: SqlClient.SqlClient, playerId: PlayerId) =>
  sql`select 1 from players where id = ${playerId} for update`;

/** The tables a player is at: where they play, or joined through the link. */
const tablesOf = (sql: SqlClient.SqlClient, playerId: PlayerId) => sql`(
  select table_id from personal_visits where player_id = ${playerId}
  union select table_id from table_participants where player_id = ${playerId}
)`;

/**
 * Whether an actor still has authority over a player: it started a table the player is at, or it
 * holds an unrevoked binding to them.
 */
const holds = (sql: SqlClient.SqlClient, actorId: string, playerId: PlayerId) => sql`(
  exists (
    select 1 from tables t join player_actors pa on pa.player_id = t.starter_player_id
    where pa.actor_id = ${actorId} and pa.revoked_at is null
      and t.id in ${tablesOf(sql, playerId)}
  ) or exists (
    select 1 from player_actors
    where actor_id = ${actorId} and player_id = ${playerId} and revoked_at is null
  )
)`;

/**
 * A player the recorder may hand to another device: one at a table it started (`starter`, who
 * manages every invite and device for them), or one it records as (`bound`, which may only move
 * itself). An actor's own player never moves this way: it would carry the actor's tables with it.
 */
const authority = Effect.fn("PlayerInvites.authority")(function* (playerId: PlayerId) {
  const sql = yield* SqlClient.SqlClient;
  const { self, actorPlayers } = yield* principal();
  if (!self || actorPlayers.length === 0) return yield* new NotFound({ resource: "player" });
  const [player] = yield* sql`select id, display_name from players where id = ${playerId}`.pipe(
    Effect.flatMap(Access.decodeRows(PlayerIdentityRow)),
  );
  if (!player) return yield* new NotFound({ resource: "player" });
  const [standing] = yield* sql<{ starter: boolean; owned: boolean }>`
    select
      exists (
        select 1 from tables
        where starter_player_id in ${sql.in(actorPlayers)} and id in ${tablesOf(sql, playerId)}
      ) as starter,
      exists (
        select 1 from player_actors where player_id = ${playerId} and bound_via = 'self'
      ) as owned
  `;
  if (!standing?.starter && !actorPlayers.includes(playerId))
    return yield* new NotFound({ resource: "player" });
  if (standing?.owned) return yield* new Forbidden({ reason: "not_your_player" });
  return { self, player: PlayerIdentity.make(player), starter: standing?.starter === true };
});

const starterOnly = Effect.fn("PlayerInvites.starterOnly")(function* (playerId: PlayerId) {
  const held = yield* authority(playerId);
  if (!held.starter) return yield* new Forbidden({ reason: "starter_only" });
  return held;
});

/** A new single-use link for the player. The issuer's earlier unused links stop working. */
export const issue = Effect.fn("PlayerInvites.issue")(function* (playerId: PlayerId) {
  const sql = yield* SqlClient.SqlClient;
  const { self } = yield* authority(playerId);
  const token = randomToken();
  const id = PlayerInviteId.make(crypto.randomUUID());
  const hash = yield* digest(token);
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`
        update player_invites set revoked_at = now()
        where player_id = ${playerId} and issued_by_actor = ${self.actorId}
          and redeemed_at is null and revoked_at is null
      `;
      yield* sql`
        insert into player_invites (id, player_id, token_hash, issued_by_actor)
        values (${id}, ${playerId}, ${hash}, ${self.actorId})
      `;
    }),
  );
  const link: PlayerInviteLink = { id, token };
  return link;
});

export const access = Effect.fn("PlayerInvites.access")(function* (playerId: PlayerId) {
  const sql = yield* SqlClient.SqlClient;
  const { player } = yield* starterOnly(playerId);
  const [invite] = yield* sql<{ id: PlayerInviteId; createdAt: Date }>`
    select id, created_at from player_invites
    where player_id = ${playerId} and redeemed_at is null and revoked_at is null
    order by created_at desc limit 1
  `;
  const devices = yield* sql<{ actorId: ActorId; boundVia: "join" | "invite" }>`
    select actor_id, bound_via from player_actors
    where player_id = ${playerId} and bound_via <> 'self' and revoked_at is null
    order by actor_id
  `;
  const result: PlayerAccess = {
    player,
    invite: invite ? { id: invite.id, createdAt: DateTime.makeUnsafe(invite.createdAt) } : null,
    devices: devices.map(({ actorId, boundVia }) => ({ actorId, boundVia })),
  };
  return result;
});

/**
 * Stops one device recording as the player, with the links it made for them. Its earlier entries
 * stay, signed by it. The starter stops any device; a device stops only itself.
 */
export const revokeBinding = Effect.fn("PlayerInvites.revokeBinding")(function* (
  playerId: PlayerId,
  actorId: ActorId,
) {
  const sql = yield* SqlClient.SqlClient;
  const { self, starter } = yield* authority(playerId);
  if (!starter && actorId !== self.actorId) return yield* new Forbidden({ reason: "starter_only" });
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* lockPlayer(sql, playerId);
      // The device, and every device it invited as this player, however many hops away.
      const revoked = yield* sql<{ actorId: ActorId }>`
        with recursive chain (actor_id) as (
          select actor_id from player_actors
          where player_id = ${playerId} and actor_id = ${actorId} and bound_via <> 'self'
            and revoked_at is null
          union
          select pa.actor_id from player_actors pa join chain c on pa.invited_by_actor = c.actor_id
          where pa.player_id = ${playerId} and pa.bound_via <> 'self' and pa.revoked_at is null
        )
        update player_actors set revoked_at = now()
        where player_id = ${playerId} and actor_id in (select actor_id from chain)
        returning actor_id
      `;
      if (revoked.length === 0) return yield* new NotFound({ resource: "player" });
      yield* sql`
        update player_invites set revoked_at = now()
        where player_id = ${playerId}
          and issued_by_actor in ${sql.in(revoked.map((row) => row.actorId))}
          and redeemed_at is null and revoked_at is null
      `;
    }),
  );
});

export const revoke = Effect.fn("PlayerInvites.revoke")(function* (inviteId: PlayerInviteId) {
  const sql = yield* SqlClient.SqlClient;
  const [invite] = yield* sql<{ playerId: PlayerId }>`
    select player_id from player_invites where id = ${inviteId}
  `;
  if (!invite) return yield* new NotFound({ resource: "invite" });
  yield* starterOnly(invite.playerId);
  const revoked = yield* sql`
    update player_invites set revoked_at = now()
    where id = ${inviteId} and redeemed_at is null and revoked_at is null
    returning id
  `;
  if (revoked.length === 0) return yield* new NotFound({ resource: "invite" });
});

type InviteRow = {
  readonly id: PlayerInviteId;
  readonly playerId: PlayerId;
  readonly issuedByActor: string;
  readonly redeemedAt: Date | null;
  readonly revokedAt: Date | null;
};

const find = (sql: SqlClient.SqlClient, hash: string) =>
  sql<InviteRow>`
    select id, player_id, issued_by_actor, redeemed_at, revoked_at from player_invites
    where token_hash = ${hash}
  `.pipe(Effect.map(([row]) => row));

const usable = (invite: InviteRow | undefined) =>
  !invite
    ? Effect.fail(new NotFound({ resource: "invite" }))
    : invite.revokedAt
      ? Effect.fail(new Conflict({ reason: "invite_revoked" }))
      : invite.redeemedAt
        ? Effect.fail(new Conflict({ reason: "invite_used_up" }))
        : Effect.succeed(invite);

export const preview = Effect.fn("PlayerInvites.preview")(function* (token: string) {
  const sql = yield* SqlClient.SqlClient;
  const invite = yield* usable(yield* find(sql, yield* digest(token)));
  const [player] = yield* sql`
    select id, display_name from players where id = ${invite.playerId}
  `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));
  // Who sent it, by the issuer's own player: never anyone else at the player's tables.
  const [issuer] = yield* sql<{ displayName: string }>`
    select p.display_name from player_actors pa join players p on p.id = pa.player_id
    where pa.actor_id = ${invite.issuedByActor} and pa.bound_via = 'self'
  `;
  const result: PlayerInvitePreview = {
    player: PlayerIdentity.make(player!),
    invitedBy: issuer?.displayName ?? "",
  };
  return result;
});

/**
 * Binds the recorder's actor to the invited player, once. From then on it records that player's
 * play wherever they're at, and nobody else's. A table's starter already records for everyone.
 */
export const redeem = Effect.fn("PlayerInvites.redeem")(function* (
  token: string,
  request: RedeemInviteRequest,
) {
  const sql = yield* SqlClient.SqlClient;
  const hash = yield* digest(token);
  // A bad, used or revoked link creates nothing, not even the recorder's own player.
  const found = yield* usable(yield* find(sql, hash));
  const { self, actorPlayers } = yield* establish(request.identity);
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* lockPlayer(sql, found.playerId);
      const [row] = yield* sql<InviteRow>`
        select id, player_id, issued_by_actor, redeemed_at, revoked_at from player_invites
        where id = ${found.id} for update
      `;
      const invite = yield* usable(row);
      // The issuer may have lost the player since: then its link has too.
      const [issuer] = yield* sql<{ holds: boolean }>`
        select ${holds(sql, invite.issuedByActor, invite.playerId)} as holds
      `;
      if (!issuer?.holds) {
        yield* sql`update player_invites set revoked_at = now() where id = ${invite.id}`;
        return yield* new Conflict({ reason: "invite_revoked" });
      }
      const starts = yield* sql`
        select 1 from tables
        where starter_player_id in ${sql.in(actorPlayers)}
          and id in ${tablesOf(sql, invite.playerId)}
      `;
      if (starts.length > 0) return yield* new Conflict({ reason: "table_starter" });
      const [bound] = yield* sql<{ count: number }>`
        select count(*)::int as count from player_actors
        where player_id = ${invite.playerId} and bound_via <> 'self' and revoked_at is null
          and actor_id <> ${self.actorId}
      `;
      if ((bound?.count ?? 0) >= MAX_DEVICES)
        return yield* new Conflict({ reason: "too_many_devices" });
      yield* sql`
        insert into player_actors (player_id, actor_id, bound_via, invited_by_actor)
        values (${invite.playerId}, ${self.actorId}, 'invite', ${invite.issuedByActor})
        on conflict (player_id, actor_id) do update
          set revoked_at = null, bound_via = 'invite', invited_by_actor = excluded.invited_by_actor
      `;
      yield* sql`update player_invites set redeemed_at = now() where id = ${invite.id}`;
      const [player] = yield* sql`
        select id, display_name from players where id = ${invite.playerId}
      `.pipe(Effect.flatMap(Access.decodeRows(PlayerIdentityRow)));
      return PlayerIdentity.make(player!);
    }),
  );
});
