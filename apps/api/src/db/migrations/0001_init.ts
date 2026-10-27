import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table users (
      id text primary key,
      display_name text not null check (length(display_name) between 1 and 60),
      avatar_url text,
      created_at timestamptz not null default now()
    )
  `;

  yield* sql`
    create table groups (
      id uuid primary key,
      name text not null check (length(name) between 1 and 80),
      currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      archived_at timestamptz
    )
  `;

  yield* sql`create type member_role as enum ('owner', 'admin', 'member')`;
  yield* sql`
    create table memberships (
      group_id uuid not null references groups (id),
      user_id text not null references users (id),
      role member_role not null,
      joined_at timestamptz not null default now(),
      left_at timestamptz,
      primary key (group_id, user_id)
    )
  `;

  yield* sql`
    create table invites (
      id uuid primary key,
      group_id uuid not null references groups (id),
      code text not null unique,
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      max_uses integer check (max_uses > 0),
      uses integer not null default 0 check (uses >= 0),
      revoked_at timestamptz
    )
  `;

  // Ledger rows point at players, never users, so a guest's history survives being claimed.
  yield* sql`
    create table players (
      id uuid primary key,
      group_id uuid not null references groups (id),
      display_name text not null check (length(display_name) between 1 and 60),
      user_id text references users (id),
      claim_code text unique,
      claimed_at timestamptz,
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      unique (group_id, user_id),
      unique (id, group_id),
      check (user_id is null or claim_code is null)
    )
  `;

  yield* sql`create type venue_kind as enum ('casino', 'online', 'home')`;
  yield* sql`create type venue_source as enum ('osm', 'curated', 'user')`;
  yield* sql`
    create table venues (
      id uuid primary key,
      name text not null check (length(name) between 1 and 80),
      kind venue_kind not null,
      city text,
      region text,
      country char(2),
      lat double precision,
      lng double precision,
      source venue_source not null,
      source_ref text,
      verified_at timestamptz,
      merged_into_id uuid references venues (id),
      group_id uuid references groups (id),
      created_by text references users (id),
      created_at timestamptz not null default now(),
      unique (source, source_ref),
      check ((kind = 'home') = (group_id is not null)),
      check (merged_into_id is distinct from id)
    )
  `;
  yield* sql`create index venues_group on venues (group_id) where group_id is not null`;

  yield* sql`
    create type game as enum (
      'slots', 'blackjack', 'roulette', 'craps', 'baccarat', 'poker_cash', 'poker_tourney', 'other'
    )
  `;
  yield* sql`create type session_status as enum ('live', 'closed')`;
  yield* sql`
    create table sessions (
      id uuid primary key,
      group_id uuid not null references groups (id),
      venue_id uuid not null references venues (id),
      game game not null,
      status session_status not null default 'live',
      started_at timestamptz not null,
      ended_at timestamptz,
      notes text check (length(notes) <= 1000),
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      closed_by text references users (id),
      reopened_at timestamptz,
      unique (id, group_id),
      check ((status = 'closed') = (ended_at is not null)),
      check (ended_at is null or ended_at >= started_at)
    )
  `;
  yield* sql`create index sessions_group on sessions (group_id, started_at desc)`;

  yield* sql`
    create table session_players (
      session_id uuid not null,
      group_id uuid not null,
      player_id uuid not null,
      joined_at timestamptz not null default now(),
      primary key (session_id, player_id),
      foreign key (session_id, group_id) references sessions (id, group_id),
      foreign key (player_id, group_id) references players (id, group_id)
    )
  `;

  yield* sql`create type entry_kind as enum ('buy_in', 'cash_out', 'adjustment', 'settlement')`;
  // The composite keys keep every player and session on an entry inside the entry's group.
  yield* sql`
    create table entries (
      id uuid primary key,
      group_id uuid not null references groups (id),
      session_id uuid,
      kind entry_kind not null,
      player_id uuid not null,
      counterparty_id uuid,
      amount bigint not null,
      occurred_at timestamptz not null,
      note text check (length(note) <= 280),
      created_by text not null references users (id),
      created_at timestamptz not null default now(),
      voided_at timestamptz,
      voided_by text references users (id),
      void_reason text check (length(void_reason) <= 280),
      replaces_entry_id uuid references entries (id),
      foreign key (session_id, group_id) references sessions (id, group_id),
      foreign key (player_id, group_id) references players (id, group_id),
      foreign key (counterparty_id, group_id) references players (id, group_id),
      check (counterparty_id is distinct from player_id),
      check ((voided_at is null) = (voided_by is null)),
      check (
        case kind
          when 'settlement' then session_id is null and counterparty_id is not null and amount > 0
          when 'adjustment' then session_id is not null and counterparty_id is null and amount <> 0
          else session_id is not null and amount > 0
        end
      )
    )
  `;
  yield* sql`create index entries_group on entries (group_id, occurred_at)`;
  yield* sql`create index entries_session on entries (session_id) where session_id is not null`;

  // Entries are never edited: an update may only void a live entry, and nothing is deleted.
  yield* sql`
    create function entries_append_only() returns trigger language plpgsql as $$
    begin
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
  yield* sql`
    create trigger entries_append_only before update or delete on entries
    for each row execute function entries_append_only()
  `;
});
