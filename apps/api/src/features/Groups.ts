import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  Forbidden,
  MinorUnits,
  NotFound,
  type CreateGroupRequest,
  GroupId,
  type GroupListItem,
  type SetRoleRequest,
  type UserId,
} from "@stacks/contracts";
import { balances } from "@stacks/shared/balances";

import { EntryRow, GroupRow, MembershipRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Views from "./Views.ts";

const ok = { ok: true } as const;

export const list = Effect.fn("Groups.list")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const rows = yield* sql`
    select g.id, g.name, g.currency, g.created_at, m.group_id, m.role, p.id as player_id,
      (select count(*)::int from sessions s where s.group_id = g.id and s.status = 'live')
        as live_session_count
    from memberships m
    join groups g on g.id = m.group_id
    join players p on p.group_id = m.group_id and p.user_id = m.user_id
    where m.user_id = ${userId} and m.left_at is null
    order by g.created_at desc
  `.pipe(
    Effect.flatMap(
      Access.decodeRows(
        Schema.Struct({
          ...GroupRow.fields,
          ...MembershipRow.fields,
          liveSessionCount: Schema.Int,
        }),
      ),
    ),
  );
  if (rows.length === 0) return [];

  const entries = yield* sql`
    select * from entries
    where group_id in ${sql.in(rows.map((row) => row.id))}
      and voided_at is null and counterparty_id is not null
  `.pipe(Effect.flatMap(Access.decodeRows(EntryRow)));
  // Stakes need each group's session results, so only groups with a live stake pay for them.
  const staked = new Set(
    (yield* sql`
      select distinct group_id from stakes
      where group_id in ${sql.in(rows.map((row) => row.id))} and voided_at is null
    `.pipe(Effect.flatMap(Access.decodeRows(Schema.Struct({ groupId: GroupId }))))).map(
      (row) => row.groupId,
    ),
  );
  return yield* Effect.forEach(rows, (row) =>
    Effect.gen(function* () {
      const owed = staked.has(row.id)
        ? (yield* Views.groupBalances(row.id)).owed
        : balances(entries.filter((entry) => entry.groupId === row.id));
      return {
        group: { id: row.id, name: row.name, currency: row.currency, createdAt: row.createdAt },
        role: row.role,
        myPlayerId: row.playerId,
        myBalance: owed.get(row.playerId) ?? MinorUnits.make(0),
        liveSessionCount: row.liveSessionCount,
      } satisfies GroupListItem;
    }),
  );
});

export const create = Effect.fn("Groups.create")(function* (
  request: typeof CreateGroupRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.ensureUser();
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const inserted = yield* sql`
        insert into groups (id, name, currency, created_by)
        values (${request.id}, ${request.name}, ${request.currency}, ${userId})
        on conflict (id) do nothing
        returning id
      `;
      if (inserted.length === 0) return;
      yield* sql`
        insert into memberships (group_id, user_id, role) values (${request.id}, ${userId}, 'owner')
      `;
      yield* sql`
        insert into players (id, group_id, display_name, user_id, created_by)
        values (gen_random_uuid(), ${request.id}, ${request.displayName}, ${userId}, ${userId})
      `;
    }),
  );
  // A retried create finds the group it already made; anyone else's ID is taken.
  const member = yield* Access.membership(request.id).pipe(
    Effect.catchTags({
      Forbidden: () => Effect.fail(new Conflict({ reason: "id_taken" })),
      NotFound: Effect.die,
    }),
  );
  return yield* Views.groupDetail(member);
});

export const get = Effect.fn("Groups.get")(function* (groupId: GroupId) {
  return yield* Views.groupDetail(yield* Access.membership(groupId));
});

const balanceOf = Effect.fn("Groups.balanceOf")(function* (member: Access.Membership) {
  const { owed } = yield* Views.groupBalances(member.groupId);
  return owed.get(member.playerId) ?? 0;
});

export const leave = Effect.fn("Groups.leave")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const member = yield* Access.membership(groupId);
  if ((yield* balanceOf(member)) !== 0) {
    return yield* new Conflict({ reason: "balance_not_settled" });
  }
  if (member.role === "owner") {
    const [others] = yield* sql`
      select count(*)::int as count from memberships
      where group_id = ${groupId} and user_id <> ${userId} and left_at is null
    `.pipe(Effect.flatMap(Access.decodeRows(Schema.Struct({ count: Schema.Int }))));
    // The owner can't walk away from people still using the group.
    if (others!.count > 0) return yield* new Conflict({ reason: "last_owner" });
  }
  yield* sql`
    update memberships set left_at = now()
    where group_id = ${groupId} and user_id = ${userId} and left_at is null
  `;
  return ok;
});

const activeMember = Effect.fn("Groups.activeMember")(function* (groupId: GroupId, userId: UserId) {
  const sql = yield* SqlClient.SqlClient;
  const [target] = yield* sql`
    select m.group_id, m.role, p.id as player_id
    from memberships m
    join players p on p.group_id = m.group_id and p.user_id = m.user_id
    where m.group_id = ${groupId} and m.user_id = ${userId} and m.left_at is null
  `.pipe(Effect.flatMap(Access.decodeRows(MembershipRow)));
  if (!target) return yield* new NotFound({ resource: "player" });
  return target;
});

/** Admins remove members, and only the owner removes an admin. Balances stay as they are. */
export const removeMember = Effect.fn("Groups.removeMember")(function* (
  groupId: GroupId,
  targetUserId: UserId,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  if (targetUserId === userId) return yield* leave(groupId);
  const member = yield* Access.membership(groupId);
  yield* Access.requireAdmin(member);
  const target = yield* activeMember(groupId, targetUserId);
  if (target.role === "owner" || (target.role === "admin" && member.role !== "owner")) {
    return yield* new Forbidden({ reason: "owner_only" });
  }
  yield* sql`
    update memberships set left_at = now()
    where group_id = ${groupId} and user_id = ${targetUserId} and left_at is null
  `;
  return ok;
});

export const setRole = Effect.fn("Groups.setRole")(function* (
  groupId: GroupId,
  targetUserId: UserId,
  request: typeof SetRoleRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.requireOwner(yield* Access.membership(groupId));
  if (targetUserId === userId) return yield* new Conflict({ reason: "last_owner" });
  yield* activeMember(groupId, targetUserId);
  yield* sql`
    update memberships set role = ${request.role}
    where group_id = ${groupId} and user_id = ${targetUserId}
  `;
  return ok;
});
