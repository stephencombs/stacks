import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  Forbidden,
  GroupId,
  NotFound,
  TripId,
  type AcceptInviteRequest,
  type CreateInviteRequest,
  type InviteId,
  type InvitePreview,
} from "@stacks/contracts";

import { InviteRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import * as Views from "./Views.ts";

const inviteStatus = (invite: typeof InviteRow.Type, now: DateTime.Utc) =>
  invite.revokedAt !== null
    ? "revoked"
    : DateTime.isLessThanOrEqualTo(invite.expiresAt, now)
      ? "expired"
      : invite.maxUses !== null && invite.uses >= invite.maxUses
        ? "used_up"
        : "open";

const findByCode = Effect.fn("Invites.findByCode")(function* (code: string, lock = false) {
  const sql = yield* SqlClient.SqlClient;
  const [invite] = yield* sql`
    select id, group_id, code, expires_at, max_uses, uses, revoked_at from invites
    where code = ${code.trim().toUpperCase()}
    ${lock ? sql`for update` : sql``}
  `.pipe(Effect.flatMap(Access.decodeRows(InviteRow)));
  if (!invite) return yield* new NotFound({ resource: "invite" });
  return invite;
});

/** Any member can invite people; links last a week. */
export const create = Effect.fn("Invites.create")(function* (
  groupId: GroupId,
  request: typeof CreateInviteRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.membership(groupId);
  const expiresAt = DateTime.add(yield* DateTime.now, { days: 7 });
  yield* sql`
    insert into invites (id, group_id, code, created_by, expires_at, max_uses)
    values (${request.id}, ${groupId}, ${Access.randomCode()}, ${userId},
      ${DateTime.toDateUtc(expiresAt)}, ${request.maxUses})
    on conflict (id) do nothing
  `;
  const [invite] = yield* sql`
    select id, group_id, code, expires_at, max_uses, uses, revoked_at from invites
    where id = ${request.id}
  `.pipe(Effect.flatMap(Access.decodeRows(InviteRow)));
  if (invite!.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
  return invite!;
});

export const list = Effect.fn("Invites.list")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  yield* Access.membership(groupId);
  const now = yield* DateTime.now;
  return yield* sql`
    select id, group_id, code, expires_at, max_uses, uses, revoked_at from invites
    where group_id = ${groupId} and revoked_at is null
      and expires_at > ${DateTime.toDateUtc(now)}
    order by created_at desc
  `.pipe(Effect.flatMap(Access.decodeRows(InviteRow)));
});

export const revoke = Effect.fn("Invites.revoke")(function* (inviteId: InviteId) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const [invite] = yield* sql`
    select group_id, created_by from invites where id = ${inviteId}
  `.pipe(
    Effect.flatMap(
      Access.decodeRows(Schema.Struct({ groupId: GroupId, createdBy: Schema.String })),
    ),
  );
  if (!invite) return yield* new NotFound({ resource: "invite" });
  const member = yield* Access.membership(invite.groupId);
  if (invite.createdBy !== userId && member.role === "member") {
    return yield* new Forbidden({ reason: "admins_only" });
  }
  yield* sql`update invites set revoked_at = now() where id = ${inviteId} and revoked_at is null`;
  return { ok: true } as const;
});

export const preview = Effect.fn("Invites.preview")(function* (code: string) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const invite = yield* findByCode(code);
  const [group] = yield* sql`
    select g.name,
      (select count(*)::int from memberships m where m.group_id = g.id and m.left_at is null)
        as member_count,
      exists (
        select 1 from memberships m
        where m.group_id = g.id and m.user_id = ${userId} and m.left_at is null
      ) as already_member,
      (select t.id from trips t where t.group_id = g.id and t.ended_at is null
        order by t.started_at desc limit 1) as current_trip_id
    from groups g where g.id = ${invite.groupId}
  `.pipe(
    Effect.flatMap(
      Access.decodeRows(
        Schema.Struct({
          name: Schema.String,
          memberCount: Schema.Int,
          alreadyMember: Schema.Boolean,
          currentTripId: Schema.NullOr(TripId),
        }),
      ),
    ),
  );
  return {
    groupId: invite.groupId,
    groupName: group!.name,
    memberCount: group!.memberCount,
    status: inviteStatus(invite, yield* DateTime.now),
    alreadyMember: group!.alreadyMember,
    currentTripId: group!.alreadyMember ? group!.currentTripId : null,
  } satisfies InvitePreview;
});

/** Joins the group, or rejoins it with the same player and history after leaving. */
export const accept = Effect.fn("Invites.accept")(function* (
  code: string,
  request: typeof AcceptInviteRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.ensureUser();
  const groupId = yield* sql.withTransaction(
    Effect.gen(function* () {
      const invite = yield* findByCode(code, true);
      const [existing] = yield* sql`
        select left_at is null as active from memberships
        where group_id = ${invite.groupId} and user_id = ${userId}
      `.pipe(Effect.flatMap(Access.decodeRows(Schema.Struct({ active: Schema.Boolean }))));
      if (existing?.active) return invite.groupId;

      const status = inviteStatus(invite, yield* DateTime.now);
      if (status !== "open") {
        return yield* new Conflict({
          reason:
            status === "expired"
              ? "invite_expired"
              : status === "revoked"
                ? "invite_revoked"
                : "invite_used_up",
        });
      }
      if (existing) {
        yield* sql`
          update memberships set left_at = null, role = 'member', joined_at = now()
          where group_id = ${invite.groupId} and user_id = ${userId}
        `;
      } else {
        yield* sql`
          insert into memberships (group_id, user_id, role)
          values (${invite.groupId}, ${userId}, 'member')
        `;
        yield* sql`
          insert into players (id, group_id, display_name, user_id, created_by)
          values (gen_random_uuid(), ${invite.groupId}, ${request.displayName}, ${userId}, ${userId})
        `;
      }
      yield* sql`update invites set uses = uses + 1 where id = ${invite.id}`;
      return invite.groupId;
    }),
  );
  return yield* Views.groupDetail(yield* Access.membership(groupId).pipe(Effect.orDie));
});
