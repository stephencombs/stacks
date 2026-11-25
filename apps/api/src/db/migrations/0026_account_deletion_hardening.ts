import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * The audit actor becomes its own kind, so no recording identity can be established as it, no
 * player bound to it, and nothing can delete or change it. The detached-player branch of
 * `players_kind` no longer passes when every column is null. Clerk deletion jobs get a retry time,
 * so a job that keeps failing stops blocking those behind it.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table recording_actors drop constraint recording_actors_kind_check`;
  yield* sql`
    alter table recording_actors
      add constraint recording_actors_kind_check check (kind in ('account', 'device', 'audit'))
  `;
  yield* sql`
    update recording_actors set kind = 'audit' where id = '00000000-0000-4000-8000-000000000000'
  `;
  yield* sql`
    create function player_actors_bindable() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from recording_actors where id = new.actor_id and kind = 'audit') then
        raise exception 'the audit actor is never bound to a player';
      end if;
      return new;
    end
    $$
  `;
  yield* sql`
    create trigger player_actors_bindable before insert or update of actor_id on player_actors
    for each row execute function player_actors_bindable()
  `;
  yield* sql`
    create function recording_actors_keep_audit() returns trigger language plpgsql as $$
    begin
      if old.kind = 'audit' then
        raise exception 'the audit actor is never changed or deleted';
      end if;
      return coalesce(new, old);
    end
    $$
  `;
  yield* sql`
    create trigger recording_actors_keep_audit before update or delete on recording_actors
    for each row execute function recording_actors_keep_audit()
  `;

  yield* sql`alter table players drop constraint players_kind`;
  yield* sql`
    alter table players add constraint players_kind check (
      (group_id is not null and recording_actor_id is null and created_by is not null)
      or (group_id is null and user_id is not null and recording_actor_id is not null)
      or (group_id is null and recording_actor_id is null and created_by_actor is not null)
      or (group_id is null and user_id is null and recording_actor_id is null
        and created_by is not null and created_by = 'deleted-account')
    )
  `;

  yield* sql`
    alter table account_deletions
      add column attempts integer not null default 0,
      add column next_attempt_at timestamptz not null default now()
  `;
  yield* sql`
    create index account_deletions_due on account_deletions (next_attempt_at)
    where clerk_deleted_at is null and user_id is not null
  `;
});
