import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/**
 * Trips stop being date ranges and own their play: every session belongs to a trip, and each
 * settlement and stake squares up or covers one trip. Existing rows go to the trip whose dates
 * they fall in, or to an "Earlier sessions" trip made for their group.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`alter table trips add constraint trips_id_group unique (id, group_id)`;
  yield* sql`alter table sessions add column trip_id uuid`;
  yield* sql`alter table entries add column trip_id uuid`;
  yield* sql`alter table stakes add column trip_id uuid`;

  // Each row goes to the latest-starting trip whose dates hold it, if any.
  yield* sql`
    update sessions s set trip_id = (
      select t.id from trips t
      where t.group_id = s.group_id and s.started_at >= t.started_at
        and (t.ended_at is null or s.started_at < t.ended_at)
      order by t.started_at desc limit 1
    )
  `;
  yield* sql`
    update stakes k set trip_id = (
      select t.id from trips t
      where t.group_id = k.group_id and k.started_at >= t.started_at
        and (t.ended_at is null or k.started_at < t.ended_at)
      order by t.started_at desc limit 1
    )
  `;
  // Entries are append-only; this one backfill writes past the guard.
  yield* sql`alter table entries disable trigger entries_append_only`;
  yield* sql`
    update entries e set trip_id = (
      select t.id from trips t
      where t.group_id = e.group_id and e.occurred_at >= t.started_at
        and (t.ended_at is null or e.occurred_at < t.ended_at)
      order by t.started_at desc limit 1
    )
    where e.kind = 'settlement'
  `;

  yield* sql`
    create temporary table orphans on commit drop as
    select group_id, min(at) as first_at, max(at) as last_at from (
      select group_id, started_at as at from sessions where trip_id is null
      union all select group_id, started_at from stakes where trip_id is null
      union all select group_id, occurred_at from entries
        where kind = 'settlement' and trip_id is null
    ) loose group by group_id
  `;
  yield* sql`
    create temporary table earlier on commit drop as
    select o.group_id, gen_random_uuid() as trip_id, o.first_at, o.last_at, g.created_by
    from orphans o join groups g on g.id = o.group_id
  `;
  yield* sql`
    insert into trips (id, group_id, name, started_at, ended_at, created_by)
    select trip_id, group_id, 'Earlier sessions', first_at, greatest(last_at, first_at), created_by
    from earlier
  `;
  yield* sql`
    update sessions s set trip_id = e.trip_id from earlier e
    where s.trip_id is null and s.group_id = e.group_id
  `;
  yield* sql`
    update stakes k set trip_id = e.trip_id from earlier e
    where k.trip_id is null and k.group_id = e.group_id
  `;
  yield* sql`
    update entries x set trip_id = e.trip_id from earlier e
    where x.kind = 'settlement' and x.trip_id is null and x.group_id = e.group_id
  `;
  yield* sql`alter table entries enable trigger entries_append_only`;

  yield* sql`alter table sessions alter column trip_id set not null`;
  yield* sql`alter table stakes alter column trip_id set not null`;
  yield* sql`
    alter table entries add constraint entries_trip_for_settlements
      check ((kind = 'settlement') = (trip_id is not null))
  `;
  yield* sql`
    alter table sessions add constraint sessions_trip
      foreign key (trip_id, group_id) references trips (id, group_id)
  `;
  yield* sql`
    alter table entries add constraint entries_trip
      foreign key (trip_id, group_id) references trips (id, group_id)
  `;
  yield* sql`
    alter table stakes add constraint stakes_trip
      foreign key (trip_id, group_id) references trips (id, group_id)
  `;
  yield* sql`create index sessions_trip on sessions (trip_id, started_at)`;
  yield* sql`create index entries_trip on entries (trip_id) where trip_id is not null`;
  yield* sql`create index stakes_trip on stakes (trip_id)`;
});
