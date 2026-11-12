import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { GroupId } from "@stacks/contracts";

import * as Access from "./Access.ts";

/** Problems that stop the import: data the new model can't hold, or that may still change. */
const blocking = ["live_session", "broken_correction", "invalid_audit", "unsafe_amount"] as const;
/** Groups the import leaves on the legacy ledger until it supports their currency. */
const excluded = ["non_usd_group"] as const;
/** Facts the import keeps as they are, flagged for the people involved. */
const reconcile = ["windowed_stake", "overlapping_stake", "ambiguous_player"] as const;

export const LegacyIssue = Schema.Struct({
  kind: Schema.Literals([...blocking, ...excluded, ...reconcile]),
  groupId: GroupId,
  /** The entry, trip, stake, player or group the issue is about. */
  subjectId: Schema.String,
  detail: Schema.String,
});
export type LegacyIssue = typeof LegacyIssue.Type;

/** Every group when null. */
export type LegacyScope = readonly [GroupId, ...Array<GroupId>] | null;

export class LegacyBlocked extends Data.TaggedError("LegacyBlocked")<{
  readonly issues: ReadonlyArray<LegacyIssue>;
}> {}

interface ImportReport {
  readonly dryRun: boolean;
  /** Rows inserted or brought up to date; all zero when a rerun finds nothing new. */
  readonly identities: number;
  readonly tables: number;
  readonly visits: number;
  readonly entries: number;
}

class DryRun extends Data.TaggedError("DryRun")<{ readonly report: ImportReport }> {}

const MAX_SAFE = "9007199254740991";

/** Only USD groups move; the rest stay on the legacy ledger. */
const migrating = (sql: SqlClient.SqlClient, scope: LegacyScope) => (column: string) =>
  sql`${sql.literal(column)} in (
    select id from groups
    where currency = 'USD' and ${scope ? sql.in("id", scope) : sql.literal("true")}
  )`;

// A UUIDv8 from the session and player, so every run names a participation the same way.
const participationId = (session: string, player: string) => {
  const hash = `md5('legacy-visit:' || ${session} || ':' || ${player})`;
  return `(substr(${hash}, 1, 12) || '8' || substr(${hash}, 14, 3) || '8' || substr(${hash}, 18))::uuid`;
};

const findIssues = Effect.fn("LegacyMigration.findIssues")(function* (scope: LegacyScope) {
  const sql = yield* SqlClient.SqlClient;
  const within = migrating(sql, scope);
  return yield* sql`
    select 'non_usd_group' as kind, g.id as group_id, g.id::text as subject_id,
      'Records money in ' || g.currency || '; it stays on the legacy ledger.' as detail
    from groups g
    where g.currency <> 'USD' and ${scope ? sql.in("g.id", scope) : sql.literal("true")}
      and (exists (select 1 from entries e where e.group_id = g.id)
        or exists (select 1 from stakes k where k.group_id = g.id))

    union all
    select 'live_session', s.group_id, s.id::text, 'Still open; close it before the cutover.'
    from sessions s
    where s.status = 'live' and ${within("s.group_id")}

    union all
    select 'broken_correction', e.group_id, e.id::text,
      case
        when r.voided_at is null then 'Replaces an entry that is still live.'
        when r.session_id is distinct from e.session_id then 'Replaces an entry elsewhere.'
        else 'Replaces an entry another correction already replaced.'
      end
    from entries e join entries r on r.id = e.replaces_entry_id
    where ${within("e.group_id")} and (
      r.voided_at is null
      or r.session_id is distinct from e.session_id
      or exists (select 1 from entries o where o.replaces_entry_id = r.id and o.id <> e.id)
    )

    union all
    select 'invalid_audit', e.group_id, e.id::text, 'Voided before it was created.'
    from entries e
    where ${within("e.group_id")} and e.voided_at < e.created_at

    union all
    select 'unsafe_amount', e.group_id, e.id::text, 'Amount is too large to count exactly.'
    from entries e
    where ${within("e.group_id")} and abs(e.amount) > ${MAX_SAFE}::bigint
    union all
    select 'unsafe_amount', k.group_id, k.id::text, 'Amount is too large to count exactly.'
    from stakes k
    where ${within("k.group_id")} and k.amount > ${MAX_SAFE}::bigint

    union all
    select 'windowed_stake', k.group_id, k.id::text,
      'Covers only part of the borrower''s play in its trip.'
    from stakes k join trips t on t.id = k.trip_id
    where ${within("k.group_id")} and k.voided_at is null and (
      (k.ended_at is not null and t.ended_at is null)
      or exists (
        select 1 from sessions s join session_players sp on sp.session_id = s.id
        where s.trip_id = k.trip_id and sp.player_id = k.borrower_id
          and (s.started_at < k.started_at or s.started_at >= k.ended_at)
      )
    )

    union all
    select 'overlapping_stake', k.group_id, k.id::text,
      'Another stake covers the same borrower at the same time.'
    from stakes k
    where ${within("k.group_id")} and k.voided_at is null and exists (
      select 1 from stakes o
      where o.id <> k.id and o.voided_at is null and o.trip_id = k.trip_id
        and o.borrower_id = k.borrower_id
        and o.started_at < coalesce(k.ended_at, 'infinity')
        and k.started_at < coalesce(o.ended_at, 'infinity')
    )

    union all
    select 'ambiguous_player', p.group_id, p.id::text,
      'Shares the name "' || p.display_name || '" with another player; kept separate.'
    from players p
    where p.group_id is not null and ${within("p.group_id")} and exists (
      select 1 from players o
      where o.group_id = p.group_id and o.id <> p.id
        and lower(btrim(o.display_name)) = lower(btrim(p.display_name))
    )
    order by kind, group_id, subject_id
  `.pipe(Effect.flatMap(Access.decodeRows(LegacyIssue)));
});

const isBlocking = (issue: LegacyIssue) =>
  (blocking as ReadonlyArray<LegacyIssue["kind"]>).includes(issue.kind);
const isExcluded = (issue: LegacyIssue) =>
  (excluded as ReadonlyArray<LegacyIssue["kind"]>).includes(issue.kind);

/**
 * Read-only report of legacy histories to fix or decide before the cutover. The transaction is
 * read only, so the database refuses any write.
 */
export const preflight = Effect.fn("LegacyMigration.preflight")(function* (scope: LegacyScope) {
  const sql = yield* SqlClient.SqlClient;
  const issues = yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`set transaction isolation level repeatable read, read only`;
      return yield* findIssues(scope);
    }),
  );
  return {
    blocking: issues.filter(isBlocking),
    excluded: issues.filter(isExcluded),
    reconcile: issues.filter((issue) => !isBlocking(issue) && !isExcluded(issue)),
  };
});

/**
 * Copies legacy play into the new model, keeping every ID and amount. It runs in one transaction
 * on one snapshot, refuses while a blocking issue exists, and only inserts what's missing or
 * carries over a later void or close, so running it again changes nothing. A dry run rolls back.
 */
export const importLegacy = Effect.fn("LegacyMigration.importLegacy")(function* (options: {
  readonly scope: LegacyScope;
  readonly dryRun: boolean;
}) {
  const sql = yield* SqlClient.SqlClient;
  const within = migrating(sql, options.scope);
  const work = Effect.gen(function* () {
    yield* sql`set transaction isolation level repeatable read`;
    const blockers = (yield* findIssues(options.scope)).filter(isBlocking);
    if (blockers.length > 0) return yield* new LegacyBlocked({ issues: blockers });

    // Each account in legacy play gets its one personal player, linked by user. Claimed group
    // players keep their own IDs and history; guests are never matched up by name.
    const identities = yield* sql`
      insert into players (id, group_id, display_name, user_id, created_by, recording_actor_id)
      select gen_random_uuid(), null, u.display_name, u.id, u.id, gen_random_uuid()
      from users u
      where not exists (
        select 1 from players own where own.user_id = u.id and own.recording_actor_id is not null
      )
        and (
          exists (select 1 from players p where p.user_id = u.id and ${within("p.group_id")})
          or exists (
            select 1 from entries e
            where (e.created_by = u.id or e.voided_by = u.id) and ${within("e.group_id")}
          )
        )
      on conflict do nothing
      returning id, recording_actor_id
    `;
    for (const identity of identities)
      yield* sql`
        with actor as (
          insert into recording_actors (id, kind) values (${identity.recordingActorId}, 'account')
        )
        insert into player_actors (player_id, actor_id)
        values (${identity.id}, ${identity.recordingActorId})
      `;

    const participations = sql.literal(`(
      select session_id, player_id from session_players
      union
      select session_id, player_id from entries where session_id is not null
    )`);
    // The session's table has no starter, so nobody records at it again.
    const tables = yield* sql`
      insert into tables (id, starter_player_id, game, venue_id, high_limit, legacy_session_id)
      select s.id, null, s.game, s.venue_id, s.high_limit, s.id
      from sessions s
      where ${within("s.group_id")}
        and exists (select 1 from ${participations} part where part.session_id = s.id)
      on conflict (id) do update
        set game = excluded.game, venue_id = excluded.venue_id, high_limit = excluded.high_limit
        where (tables.game, tables.venue_id, tables.high_limit) is distinct from
          (excluded.game, excluded.venue_id, excluded.high_limit)
      returning id
    `;
    const visits = yield* sql`
      insert into personal_visits (id, player_id, table_id, started_at, finished_at, revision,
        legacy_session_id)
      select ${sql.literal(participationId("s.id", "part.player_id"))}, part.player_id, s.id,
        s.started_at, s.ended_at, 0, s.id
      from ${participations} part join sessions s on s.id = part.session_id
      where ${within("s.group_id")}
      on conflict (legacy_session_id, player_id) do update
        set finished_at = excluded.finished_at
        where personal_visits.finished_at is distinct from excluded.finished_at
      returning id
    `;

    const actor = (alias: string, user: string) =>
      sql.literal(
        `left join players ${alias} on ${alias}.user_id = ${user} and ${alias}.recording_actor_id is not null`,
      );
    const entries = yield* sql`
      insert into personal_entries (id, visit_id, kind, amount, occurred_at, note, created_by,
        created_at, voided_at, voided_by, void_reason, replaces_entry_id, counterparty_id)
      select e.id, ${sql.literal(participationId("e.session_id", "e.player_id"))},
        e.kind::text::play_entry_kind, e.amount, e.occurred_at, e.note,
        made.recording_actor_id, e.created_at, e.voided_at, undone.recording_actor_id,
        e.void_reason, e.replaces_entry_id, e.counterparty_id
      from entries e
      ${actor("made", "e.created_by")}
      ${actor("undone", "e.voided_by")}
      where ${within("e.group_id")}
      on conflict (id) do update
        set voided_at = excluded.voided_at, voided_by = excluded.voided_by,
          void_reason = excluded.void_reason
        where personal_entries.voided_at is null and excluded.voided_at is not null
          and personal_entries.visit_id = excluded.visit_id
      returning id
    `;

    const report: ImportReport = {
      dryRun: options.dryRun,
      identities: identities.length,
      tables: tables.length,
      visits: visits.length,
      entries: entries.length,
    };
    if (options.dryRun) return yield* new DryRun({ report });
    return report;
  });
  return yield* sql
    .withTransaction(work)
    .pipe(Effect.catchTag("DryRun", ({ report }) => Effect.succeed(report)));
});
