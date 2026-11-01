import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  Forbidden,
  NotFound,
  type GroupId,
  type PlayerId,
} from "@stacks/contracts";

import { MembershipRow } from "../db/rows.ts";

/** Decodes query rows; a row that doesn't match its schema is a bug, so it dies. */
export const decodeRows =
  <A, I>(schema: Schema.Codec<A, I>) =>
  (rows: ReadonlyArray<unknown>) =>
    Schema.decodeUnknownEffect(Schema.Array(schema))(rows).pipe(Effect.orDie);

export type Membership = typeof MembershipRow.Type;

/** The current user's active membership in the group. */
export const membership = Effect.fn("Access.membership")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const groups = yield* sql`select 1 from groups where id = ${groupId}`;
  if (groups.length === 0) return yield* new NotFound({ resource: "group" });

  const [row] = yield* sql`
    select m.group_id, m.role, p.id as player_id
    from memberships m
    join players p on p.group_id = m.group_id and p.user_id = m.user_id
    where m.group_id = ${groupId} and m.user_id = ${userId} and m.left_at is null
  `.pipe(Effect.flatMap(decodeRows(MembershipRow)));
  if (!row) return yield* new Forbidden({ reason: "not_a_member" });
  return row;
});

export const requireAdmin = (member: Membership) =>
  member.role === "member" ? Effect.fail(new Forbidden({ reason: "admins_only" })) : Effect.void;

export const requireOwner = (member: Membership) =>
  member.role === "owner" ? Effect.void : Effect.fail(new Forbidden({ reason: "owner_only" }));

/** Creates or refreshes the current user's row; needed before a non-member writes anything. */
export const ensureUser = Effect.fn("Access.ensureUser")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const user = yield* CurrentUser;
  yield* sql`
    insert into users (id, display_name, avatar_url)
    values (${user.userId}, ${user.displayName}, ${user.avatarUrl})
    on conflict (id) do update
      set display_name = excluded.display_name, avatar_url = excluded.avatar_url
      where (users.display_name, users.avatar_url)
        is distinct from (excluded.display_name, excluded.avatar_url)
  `;
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short code people can read aloud or type: no 0/O or 1/I. */
export const randomCode = (length = 10) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
};

/** Fails unless every player belongs to the group. */
export const requirePlayersInGroup = Effect.fn("Access.requirePlayersInGroup")(function* (
  groupId: GroupId,
  playerIds: ReadonlyArray<PlayerId>,
) {
  const sql = yield* SqlClient.SqlClient;
  const unique = Array.from(new Set(playerIds));
  if (unique.length === 0) return;
  const found = yield* sql`
    select id from players where group_id = ${groupId} and id in ${sql.in(unique)}
  `;
  if (found.length !== unique.length) return yield* new Conflict({ reason: "player_not_in_group" });
});
