import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  Conflict,
  CurrentUser,
  GroupId,
  NotFound,
  PlayerId,
  type AddGuestRequest,
  type ClaimPreview,
} from "@stacks/contracts";

import * as Access from "./Access.ts";
import * as Views from "./Views.ts";

const ClaimRow = Schema.Struct({
  playerId: PlayerId,
  groupId: GroupId,
  displayName: Schema.String,
  groupName: Schema.String,
});

const findClaim = Effect.fn("Guests.findClaim")(function* (code: string, lock = false) {
  const sql = yield* SqlClient.SqlClient;
  const [claim] = yield* sql`
    select p.id as player_id, p.group_id, p.display_name, g.name as group_name
    from players p join groups g on g.id = p.group_id
    where p.claim_code = ${code.trim().toUpperCase()}
    ${lock ? sql`for update of p` : sql``}
  `.pipe(Effect.flatMap(Access.decodeRows(ClaimRow)));
  if (!claim) return yield* new NotFound({ resource: "claim" });
  return claim;
});

export const add = Effect.fn("Guests.add")(function* (
  groupId: GroupId,
  request: typeof AddGuestRequest.Type,
) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  const member = yield* Access.membership(groupId);
  const [row] = yield* sql`
    insert into players (id, group_id, display_name, claim_code, created_by)
    values (${request.id}, ${groupId}, ${request.displayName}, ${Access.randomCode()}, ${userId})
    on conflict (id) do update set id = players.id
    returning group_id
  `.pipe(Effect.flatMap(Access.decodeRows(Schema.Struct({ groupId: GroupId }))));
  if (row!.groupId !== groupId) return yield* new Conflict({ reason: "id_taken" });
  return yield* Views.groupDetail(member);
});

export const previewClaim = Effect.fn("Guests.previewClaim")(function* (code: string) {
  const claim = yield* findClaim(code);
  return {
    groupId: claim.groupId,
    groupName: claim.groupName,
    playerId: claim.playerId,
    displayName: claim.displayName,
  } satisfies ClaimPreview;
});

/**
 * Makes a guest's history the current user's. Someone who already joined the group has an
 * empty player row of their own; it's dropped. If that row has history, two players would need
 * merging, which isn't supported, so the claim is refused.
 */
export const claim = Effect.fn("Guests.claim")(function* (code: string) {
  const sql = yield* SqlClient.SqlClient;
  const { userId } = yield* CurrentUser;
  yield* Access.ensureUser();
  const groupId = yield* sql.withTransaction(
    Effect.gen(function* () {
      const guest = yield* findClaim(code, true);
      const [own] = yield* sql`
        select p.id,
          exists (
            select 1 from entries e where e.player_id = p.id or e.counterparty_id = p.id
          ) or exists (select 1 from session_players sp where sp.player_id = p.id) as has_history
        from players p where p.group_id = ${guest.groupId} and p.user_id = ${userId}
      `.pipe(
        Effect.flatMap(
          Access.decodeRows(Schema.Struct({ id: PlayerId, hasHistory: Schema.Boolean })),
        ),
      );
      if (own?.hasHistory) return yield* new Conflict({ reason: "claim_has_history" });
      if (own) yield* sql`delete from players where id = ${own.id}`;

      yield* sql`
        update players set user_id = ${userId}, claim_code = null, claimed_at = now()
        where id = ${guest.playerId}
      `;
      yield* sql`
        insert into memberships (group_id, user_id, role)
        values (${guest.groupId}, ${userId}, 'member')
        on conflict (group_id, user_id) do update set left_at = null
          where memberships.left_at is not null
      `;
      return guest.groupId;
    }),
  );
  return yield* Views.groupDetail(yield* Access.membership(groupId).pipe(Effect.orDie));
});
