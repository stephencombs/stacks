import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import * as Schema from "effect/Schema";
import {
  ActorId,
  Conflict,
  NotFound,
  PlayerIdentity,
  TableId,
  type PairBalance,
  type PairHistory,
  type PlayerBalances,
  PlayerId,
} from "@stacks/contracts";
import { pairBalances, type PairEntry } from "@stacks/shared/pairBalances";
import type { Repayment } from "@stacks/contracts";

import { PersonalEntryRow, RepaymentRow } from "../db/rows.ts";
import * as Access from "./Access.ts";
import { entryOf, principal, repaymentOf, sharedTablePlayers } from "./Recording.ts";

const PairEntryRow = Schema.Struct({
  ...PersonalEntryRow.fields,
  playerId: PlayerId,
  tableId: TableId,
});

const between = (balance: PairBalance, a: PlayerId, b: PlayerId) =>
  (balance.debtorId === a && balance.creditorId === b) ||
  (balance.debtorId === b && balance.creditorId === a);

/**
 * Nets the pair facts, or refuses with the players named in the log when a stored total is past
 * what minor units count exactly. Money is never dropped or rounded to make a balance fit.
 */
const owedFrom = Effect.fn("Relationships.owedFrom")(function* (
  entries: ReadonlyArray<PairEntry>,
  repayments: ReadonlyArray<Repayment>,
) {
  return yield* Effect.try({
    try: () => pairBalances(entries, repayments),
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      cause instanceof RangeError
        ? Effect.logError("Pair balance can't be counted exactly", {
            cause: cause.message,
            entries: entries.map((entry) => entry.id),
            repayments: repayments.map((repayment) => repayment.id),
          }).pipe(Effect.andThen(Effect.fail(new Conflict({ reason: "unsafe_amount" }))))
        : Effect.die(cause),
    ),
  );
});

/**
 * The play and payments between `players` and anyone. Only covered buy-ins and held cash-outs at
 * the new tables, and payments recorded between players, count: imported Trip history, including
 * its settlements, keeps its own balances and never nets against new play.
 */
const facts = Effect.fn("Relationships.facts")(function* (
  players: ReadonlyArray<PlayerId>,
  counterparty: PlayerId | null = null,
) {
  const sql = yield* SqlClient.SqlClient;
  const mine = sql.in(players);
  const other = counterparty === null ? sql`true` : sql`false`;
  const entries = yield* sql`
    select e.*, v.player_id, v.table_id
    from personal_entries e join personal_visits v on v.id = e.visit_id
    where e.counterparty_id is not null and v.legacy_session_id is null
      and ((v.player_id in ${mine} and (${other} or e.counterparty_id = ${counterparty}))
        or (e.counterparty_id in ${mine} and (${other} or v.player_id = ${counterparty})))
    order by e.created_at, e.id
  `.pipe(Effect.flatMap(Access.decodeRows(PairEntryRow)));
  const repayments = yield* sql`
    select * from repayments
    where recorded_from_trip_id is null
      and ((from_player_id in ${mine} and (${other} or to_player_id = ${counterparty}))
        or (to_player_id in ${mine} and (${other} or from_player_id = ${counterparty})))
    order by created_at, id
  `.pipe(Effect.flatMap(Access.decodeRows(RepaymentRow)));
  return {
    entries: entries.map(({ playerId, tableId, ...row }) => ({
      playerId,
      tableId,
      entry: entryOf(row),
    })),
    repayments: repayments.map(repaymentOf),
  };
});

/** Every pair of one of the caller's players and someone they've shared a table with. */
export const balances = Effect.fn("Relationships.balances")(function* () {
  const { actorPlayers } = yield* principal();
  const known = (yield* sharedTablePlayers(actorPlayers)).filter(
    (row) => !actorPlayers.includes(row.id),
  );
  if (known.length === 0) return { pairs: [] } satisfies PlayerBalances;
  const { entries, repayments } = yield* facts(actorPlayers);
  const owed = yield* owedFrom(
    entries.map(({ playerId, entry }) => ({ ...entry, playerId })),
    repayments,
  );
  const result: PlayerBalances = {
    pairs: known.map((row) => ({
      playerId: row.playerId,
      counterparty: PlayerIdentity.make({ id: row.id, displayName: row.displayName }),
      balance: owed.find((balance) => between(balance, row.playerId, row.id)) ?? null,
    })),
  };
  return result;
});

/**
 * Everything between the caller and someone they've shared a table with. Anyone else is a 404, so
 * a player ID reveals nothing. The caller's own player is preferred when several of theirs qualify.
 */
export const pair = Effect.fn("Relationships.pair")(function* (counterpartyId: PlayerId) {
  const sql = yield* SqlClient.SqlClient;
  const { self, actorPlayers } = yield* principal();
  if (actorPlayers.includes(counterpartyId)) return yield* new NotFound({ resource: "player" });
  const known = (yield* sharedTablePlayers(actorPlayers)).filter(
    (row) => row.id === counterpartyId,
  );
  const row = known.find((item) => item.playerId === self?.playerId) ?? known[0];
  if (!row) return yield* new NotFound({ resource: "player" });
  const { entries, repayments } = yield* facts([row.playerId], counterpartyId);
  const [first, second] =
    row.playerId < counterpartyId ? [row.playerId, counterpartyId] : [counterpartyId, row.playerId];
  const [counted] = yield* sql<{ count: number }>`
    select count(*)::int as count from personal_operations
    where pair_first_player_id = ${first} and pair_second_player_id = ${second}
  `;
  const actorIds = [
    ...new Set(
      [...entries.map(({ entry }) => entry), ...repayments].flatMap((fact) =>
        fact.voidedBy ? [fact.createdBy, fact.voidedBy] : [fact.createdBy],
      ),
    ),
  ];
  const actors =
    actorIds.length === 0
      ? []
      : yield* sql<{ actorId: string; displayName: string }>`
          select pa.actor_id, p.display_name
          from player_actors pa join players p on p.id = pa.player_id
          where pa.bound_via = 'self' and pa.actor_id in ${sql.in(actorIds)}
        `;
  const [balance] = yield* owedFrom(
    entries.map(({ playerId, entry }) => ({ ...entry, playerId })),
    repayments,
  );
  const history: PairHistory = {
    pair: {
      playerId: row.playerId,
      counterparty: PlayerIdentity.make({ id: row.id, displayName: row.displayName }),
      balance: balance ?? null,
    },
    revision: counted?.count ?? 0,
    play: entries,
    repayments,
    actors: actors.map((actor) => ({
      actorId: ActorId.make(actor.actorId),
      displayName: actor.displayName,
    })),
  };
  return history;
});
