import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Deleting an account keeps what friends recorded. Every audit column that named the account
 * moves to the reserved `deleted-account` user, and recording actor ids to the reserved unbound
 * actor. Entries may only be touched when `Account.delete` sets `stacks.account_deletion` for its
 * transaction. A table player left behind by a deleted account has no user or actor, which
 * `players_kind` now allows. `personal_visits.group_player_id` pins the group player a visit
 * counted for, since that can no longer be worked out from `user_id`. `account_deletions` is the
 * fence that keeps the account's tokens out, and the job that finishes deleting its Clerk user.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`insert into users (id, display_name) values ('deleted-account', 'Deleted account')`;
  yield* sql`
    insert into recording_actors (id, kind) values ('00000000-0000-4000-8000-000000000000', 'account')
  `;

  yield* sql`alter table personal_visits add column group_player_id uuid references players (id)`;

  yield* sql`
    create table account_deletions (
      user_id_hash text primary key,
      user_id text,
      requested_at timestamptz not null default now(),
      clerk_deleted_at timestamptz,
      apple_revoked boolean not null default false,
      check ((clerk_deleted_at is null) = (user_id is not null))
    )
  `;

  yield* sql`
    create or replace function entries_append_only() returns trigger language plpgsql as $$
    begin
      if current_setting('stacks.account_deletion', true) = 'on' then
        return coalesce(new, old);
      end if;
      if tg_op = 'DELETE' then
        raise exception 'entries are never deleted';
      end if;
      if old.voided_at is not null
        or (to_jsonb(new) - 'voided_at' - 'voided_by' - 'void_reason')
          <> (to_jsonb(old) - 'voided_at' - 'voided_by' - 'void_reason') then
        raise exception 'entries are never edited; void and replace them instead';
      end if;
      return new;
    end
    $$
  `;

  yield* sql`alter table players drop constraint players_kind`;
  yield* sql`
    alter table players add constraint players_kind check (
      (group_id is not null and recording_actor_id is null and created_by is not null)
      or (group_id is null and user_id is not null and recording_actor_id is not null)
      or (group_id is null and recording_actor_id is null and created_by_actor is not null)
      or (group_id is null and user_id is null and recording_actor_id is null
        and created_by = 'deleted-account')
    )
  `;
});
