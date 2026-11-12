import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ActorId,
  CurrencyCode,
  EntryId,
  MinorUnits,
  PlayEntry,
  PlayerId,
  StakeId,
  TripId,
  VisitId,
  type GroupId,
  type SessionId,
} from "@stacks/contracts";
import { balances } from "@stacks/shared/balances";
import { playerResults } from "@stacks/shared/results";

import { catalogVenue, groupWith, ids, usd, users } from "../testing/fixtures.ts";
import { TestApi } from "../testing/TestApi.ts";
import * as LegacyMigration from "./LegacyMigration.ts";

type Client = Effect.Success<ReturnType<TestApi["Service"]["as"]>>;

const scope = (groupId: GroupId) => [groupId] as const;
const date = (value: Date) => DateTime.makeUnsafe(value);
const optionalDate = (value: Date | null) => (value === null ? null : date(value));
const sorted = <V>(map: ReadonlyMap<string, V>) =>
  [...map].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

/** Every result and balance the legacy ledger reports, by trip. */
const legacyLedger = Effect.fn("test.legacyLedger")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{
    id: string;
    kind: "buy_in" | "cash_out" | "adjustment";
    playerId: string;
    counterpartyId: string | null;
    amount: bigint;
    voidedAt: Date | null;
    replacesEntryId: string | null;
    trip: string;
  }>`
    select e.id, e.kind, e.player_id, e.counterparty_id, e.amount, e.voided_at,
      e.replaces_entry_id, s.trip_id as trip
    from entries e join sessions s on s.id = e.session_id
    where e.group_id = ${groupId}
  `;
  const entries = rows.map((row) => ({
    ...row,
    playerId: PlayerId.make(row.playerId),
    counterpartyId: row.counterpartyId === null ? null : PlayerId.make(row.counterpartyId),
    amount: MinorUnits.make(Number(row.amount)),
    voidedAt: optionalDate(row.voidedAt),
  }));
  const trips = new Set(entries.map((entry) => entry.trip));
  return {
    entries,
    results: sorted(playerResults(entries)),
    balances: [...trips]
      .toSorted()
      .map((trip) => [trip, sorted(balances(entries.filter((e) => e.trip === trip)))] as const)
      .filter(([, owed]) => owed.length > 0),
  };
});

/** The same group's play as the import left it, read through the new model's types and math. */
const importedLedger = Effect.fn("test.importedLedger")(function* (groupId: GroupId) {
  const sql = yield* SqlClient.SqlClient;
  const visitRows = yield* sql<{
    id: string;
    playerId: string;
    tableId: string;
    startedAt: Date;
    finishedAt: Date | null;
    tripId: string;
  }>`
    select v.id, v.player_id, v.table_id, v.started_at, v.finished_at, s.trip_id
    from personal_visits v join sessions s on s.id = v.legacy_session_id
    where s.group_id = ${groupId}
  `;
  const entryRows = yield* sql<{
    id: string;
    visitId: string;
    kind: "buy_in" | "cash_out" | "adjustment";
    counterpartyId: string | null;
    amount: bigint;
    occurredAt: Date;
    note: string | null;
    createdBy: string;
    createdAt: Date;
    voidedAt: Date | null;
    voidedBy: string | null;
    voidReason: string | null;
    replacesEntryId: string | null;
  }>`
    select e.* from personal_entries e
    join personal_visits v on v.id = e.visit_id
    join sessions s on s.id = v.legacy_session_id
    where s.group_id = ${groupId}
  `;
  const audit = (row: (typeof entryRows)[number]) => ({
    id: EntryId.make(row.id),
    amount: MinorUnits.make(Number(row.amount)),
    currency: "USD" as const,
    occurredAt: date(row.occurredAt),
    note: row.note,
    createdBy: ActorId.make(row.createdBy),
    createdAt: date(row.createdAt),
    voidedAt: optionalDate(row.voidedAt),
    voidedBy: row.voidedBy === null ? null : ActorId.make(row.voidedBy),
    voidReason: row.voidReason,
    replacesEntryId: row.replacesEntryId === null ? null : EntryId.make(row.replacesEntryId),
  });
  const entries = entryRows.map((row) =>
    PlayEntry.make({
      ...audit(row),
      visitId: VisitId.make(row.visitId),
      kind: row.kind,
      counterpartyId: row.counterpartyId === null ? null : PlayerId.make(row.counterpartyId),
    }),
  );
  const ownerOf = new Map(visitRows.map((visit) => [visit.id, PlayerId.make(visit.playerId)]));
  const results = new Map<
    PlayerId,
    { buyIn: number; cashOut: number; adjustment: number; net: number }
  >();
  for (const entry of entries) {
    if (entry.voidedAt !== null) continue;
    const owner = ownerOf.get(entry.visitId)!;
    const result = results.get(owner) ?? { buyIn: 0, cashOut: 0, adjustment: 0, net: 0 };
    if (entry.kind === "buy_in") result.buyIn += entry.amount;
    else if (entry.kind === "cash_out") result.cashOut += entry.amount;
    else result.adjustment += entry.amount;
    result.net = result.cashOut + result.adjustment - result.buyIn;
    results.set(owner, result);
  }

  const trips = new Set(visitRows.map((row) => row.tripId));
  const tripBalances = [...trips]
    .toSorted()
    .map((trip) => {
      const inTrip = new Set(visitRows.filter((row) => row.tripId === trip).map((row) => row.id));
      const nets = new Map<PlayerId, number>();
      for (const entry of entries) {
        if (
          !inTrip.has(entry.visitId) ||
          entry.voidedAt !== null ||
          entry.counterpartyId === null ||
          entry.amount === 0 ||
          entry.kind === "adjustment"
        )
          continue;
        const owner = ownerOf.get(entry.visitId)!;
        const sign = entry.kind === "buy_in" ? 1 : -1;
        nets.set(owner, (nets.get(owner) ?? 0) - sign * entry.amount);
        nets.set(entry.counterpartyId, (nets.get(entry.counterpartyId) ?? 0) + sign * entry.amount);
      }
      return [trip, sorted(new Map([...nets].filter(([, net]) => net !== 0)))] as const;
    })
    .filter(([, owed]) => owed.length > 0);
  return {
    visits: visitRows,
    entries,
    results: sorted(results),
    balances: tripBalances,
  };
});

/** What the new model must say about each legacy fact: same ID, amount, void and correction. */
const facts = (
  rows: ReadonlyArray<{
    readonly id: string;
    readonly amount: number;
    readonly voidedAt: unknown;
    readonly replacesEntryId: string | null;
  }>,
) =>
  rows
    .map((row) => ({
      id: row.id,
      amount: row.amount,
      voided: row.voidedAt !== null,
      replaces: row.replacesEntryId,
    }))
    .toSorted((a, b) => (a.id < b.id ? -1 : 1));

const expectFaithful = Effect.fn("test.expectFaithful")(function* (groupId: GroupId) {
  const legacy = yield* legacyLedger(groupId);
  const imported = yield* importedLedger(groupId);
  expect(imported.results).toEqual(legacy.results);
  expect(imported.balances).toEqual(legacy.balances);
  expect(facts(imported.entries)).toEqual(facts(legacy.entries));
  return { legacy, imported };
});

const nothingNew = {
  dryRun: false,
  identities: 0,
  tables: 0,
  visits: 0,
  entries: 0,
};

const startSession = Effect.fn("test.startSession")(function* (
  client: Client,
  tripId: TripId,
  playerIds: readonly [PlayerId, ...Array<PlayerId>],
) {
  const venue = yield* catalogVenue(client);
  const sessionId = ids.session();
  yield* client.sessions.create({
    params: { tripId },
    payload: { id: sessionId, venueId: venue.id, game: "blackjack", playerIds, notes: null },
  });
  return sessionId;
});

const entry = (
  client: Client,
  sessionId: SessionId,
  kind: "buy_in" | "cash_out" | "adjustment",
  playerId: PlayerId,
  amount: number,
  counterpartyId: PlayerId | null = null,
  replacesEntryId: EntryId | null = null,
) =>
  client.ledger.addEntry({
    params: { sessionId },
    payload: {
      id: ids.entry(),
      kind,
      playerId,
      counterpartyId,
      amount: usd(amount),
      note: null,
      replacesEntryId,
    },
  });

const addGuest = Effect.fn("test.addGuest")(function* (
  client: Client,
  groupId: GroupId,
  displayName: string,
) {
  const id = ids.player();
  const group = yield* client.guests.add({ params: { groupId }, payload: { id, displayName } });
  return group.players.find((player) => player.id === id)!;
});

it.layer(TestApi.layer, { timeout: "60 seconds" })("legacy migration", (it) => {
  it.effect("keeps IDs, money, corrections and claimed identities, and reruns as a no-op", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea, gus } = yield* users("alex", "bea", "gus");
      const group = yield* groupWith(alex, bea);
      const [alexId, beaId] = [group.myPlayerId, group.players[1]!.id];
      const claimedGus = yield* addGuest(alex, group.group.id, "Gus");
      const otherGus = yield* addGuest(alex, group.group.id, "Gus");
      yield* gus.guests.claim({ params: { code: claimedGus.claimCode! } });

      const sessionId = yield* startSession(alex, group.tripId, [alexId, beaId, claimedGus.id]);
      yield* entry(alex, sessionId, "buy_in", alexId, 10000);
      const mistake = yield* entry(alex, sessionId, "buy_in", beaId, 5000, alexId);
      const fixed = yield* entry(alex, sessionId, "buy_in", beaId, 50000, alexId, mistake.id);
      yield* entry(alex, sessionId, "buy_in", claimedGus.id, 20000);
      yield* entry(alex, sessionId, "buy_in", otherGus.id, 7000);
      const dropped = yield* entry(alex, sessionId, "adjustment", alexId, -300);
      yield* alex.ledger.voidEntry({
        params: { entryId: dropped.id },
        payload: { reason: "Oops" },
      });
      yield* entry(alex, sessionId, "cash_out", alexId, 0);
      yield* entry(alex, sessionId, "cash_out", beaId, 61000);
      yield* entry(alex, sessionId, "cash_out", claimedGus.id, 9000, otherGus.id);
      yield* entry(alex, sessionId, "cash_out", otherGus.id, 12000);
      yield* alex.sessions.close({ params: { sessionId }, payload: {} });

      const dry = yield* LegacyMigration.importLegacy({
        scope: scope(group.group.id),
        dryRun: true,
      });
      expect(dry).toEqual({
        dryRun: true,
        identities: 3,
        tables: 1,
        visits: 4,
        entries: 10,
      });
      const [untouched] = yield* sql<{ count: string }>`
        select count(*) from personal_visits where legacy_session_id = ${sessionId}
      `;
      expect(Number(untouched!.count)).toBe(0);

      const applied = yield* LegacyMigration.importLegacy({
        scope: scope(group.group.id),
        dryRun: false,
      });
      expect(applied).toEqual({ ...dry, dryRun: false });
      yield* expectFaithful(group.group.id);

      const imported = yield* importedLedger(group.group.id);
      // The correction chain survives with its IDs: the mistake stays voided and replaced.
      expect(imported.entries.find((e) => e.id === mistake.id)?.voidedAt).not.toBeNull();
      expect(imported.entries.find((e) => e.id === fixed.id)).toMatchObject({
        replacesEntryId: mistake.id,
        amount: 50000,
        counterpartyId: alexId,
      });
      // One historical table per session, shared by each player's participation.
      expect(new Set(imported.visits.map((visit) => visit.tableId))).toEqual(new Set([sessionId]));
      expect(new Set(imported.visits.map((visit) => visit.playerId))).toEqual(
        new Set([alexId, beaId, claimedGus.id, otherGus.id]),
      );
      // Two guests named Gus stay two players; only the claimed one links to an account.
      const links = yield* sql<{ id: string; userId: string | null; personal: string | null }>`
        select p.id, p.user_id,
          (select own.id from players own where own.user_id = p.user_id and own.group_id is null)
            as personal
        from players p where p.id in ${sql.in([claimedGus.id, otherGus.id])}
      `;
      const byId = new Map(links.map((link) => [link.id, link]));
      expect(byId.get(otherGus.id)).toMatchObject({ userId: null, personal: null });
      expect(byId.get(claimedGus.id)?.personal).not.toBeNull();
      // Claiming doesn't copy history: the account's own recording stays empty.
      const history = yield* gus.recording.history();
      expect(history.identity?.playerId).toBe(byId.get(claimedGus.id)?.personal);
      expect(history.visits).toEqual([]);

      expect(
        yield* LegacyMigration.importLegacy({ scope: scope(group.group.id), dryRun: false }),
      ).toEqual(nothingNew);

      // Later legacy writes come across on the next run, and only they do.
      yield* alex.sessions.reopen({ params: { sessionId } });
      yield* alex.ledger.voidEntry({ params: { entryId: fixed.id }, payload: { reason: "Again" } });
      // An open session blocks the import until it closes again.
      const open = yield* Effect.flip(
        LegacyMigration.importLegacy({ scope: scope(group.group.id), dryRun: false }),
      );
      expect(open).toMatchObject({ _tag: "LegacyBlocked", issues: [{ kind: "live_session" }] });
      yield* alex.sessions.close({
        params: { sessionId },
        payload: { endedAt: DateTime.makeUnsafe("2099-01-01T00:00:00Z") },
      });
      expect(
        yield* LegacyMigration.importLegacy({ scope: scope(group.group.id), dryRun: false }),
      ).toEqual({ ...nothingNew, visits: 4, entries: 1 });
      yield* expectFaithful(group.group.id);
    }),
  );

  it.effect("flags each problem class without writing, and refuses to import blockers", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex, bea, cal } = yield* users("alex", "bea", "cal");
      const group = yield* groupWith(alex, bea, cal);
      const [alexId, beaId, calId] = group.players.map((player) => player.id) as [
        PlayerId,
        PlayerId,
        PlayerId,
      ];
      const twin = yield* addGuest(alex, group.group.id, "member 1");

      const stake = (borrower: PlayerId, lender: PlayerId) =>
        alex.stakes.create({
          params: { tripId: group.tripId },
          payload: {
            id: StakeId.make(crypto.randomUUID()),
            lenderId: lender,
            borrowerId: borrower,
            amount: usd(10000),
            lenderShare: 50,
            note: null,
          },
        });
      const backing = yield* stake(calId, alexId);
      const second = yield* stake(calId, beaId);
      const ended = yield* stake(beaId, alexId);
      yield* alex.stakes.end({ params: { stakeId: ended.id }, payload: {} });
      const sessionId = yield* startSession(alex, group.tripId, [alexId, beaId, calId]);
      yield* entry(alex, sessionId, "buy_in", beaId, 4000, alexId);
      yield* entry(alex, sessionId, "buy_in", calId, 4000, beaId);

      const importedRows = sql`
        select count(*) from personal_visits where legacy_session_id = ${sessionId}
      `;
      const before = yield* importedRows;
      const report = yield* LegacyMigration.preflight(scope(group.group.id));
      expect(report.blocking.map((issue) => [issue.kind, issue.subjectId])).toEqual([
        ["live_session", sessionId],
      ]);
      const flagged = report.reconcile.map((issue) => [issue.kind, issue.subjectId]);
      expect(flagged).toEqual(
        expect.arrayContaining([
          ["overlapping_stake", backing.id],
          ["overlapping_stake", second.id],
          ["windowed_stake", ended.id],
          ["ambiguous_player", twin.id],
        ]),
      );
      // A stake that covers its borrower's whole trip alone is not flagged.
      expect(flagged.filter(([, id]) => id === ended.id)).toHaveLength(1);
      expect(yield* importedRows).toEqual(before);

      // A non-USD group is left out, live session and all; a broken correction blocks.
      const yen = ids.group();
      yield* alex.groups.create({
        payload: { id: yen, name: "Tokyo", currency: CurrencyCode.make("JPY"), displayName: "A" },
      });
      const tokyo = yield* alex.trips.create({
        params: { groupId: yen },
        payload: { id: ids.trip(), name: "Tokyo" },
      });
      const tokyoGroup = yield* alex.groups.get({ params: { groupId: yen } });
      const tokyoSession = yield* startSession(alex, tokyo.id, [tokyoGroup.myPlayerId]);
      yield* entry(alex, tokyoSession, "buy_in", tokyoGroup.myPlayerId, 10000);
      const live = yield* entry(alex, sessionId, "buy_in", alexId, 100);
      const broken = ids.entry();
      // The API can't write this; old data may still hold it.
      yield* sql`
        insert into entries (id, group_id, session_id, kind, player_id, amount, occurred_at,
          created_by, replaces_entry_id)
        select ${broken}, group_id, session_id, kind, player_id, 200, occurred_at, created_by, id
        from entries where id = ${live.id}
      `;
      const blocked = yield* LegacyMigration.preflight([group.group.id, yen]);
      expect(blocked.blocking.map((issue) => [issue.kind, issue.subjectId])).toEqual([
        ["broken_correction", broken],
        ["live_session", sessionId],
      ]);
      expect(blocked.excluded.map((issue) => [issue.kind, issue.subjectId])).toEqual([
        ["non_usd_group", yen],
      ]);
      const refused = yield* Effect.flip(
        LegacyMigration.importLegacy({ scope: [group.group.id, yen], dryRun: false }),
      );
      expect(refused._tag).toBe("LegacyBlocked");
      expect(yield* importedRows).toEqual(before);
    }),
  );

  it.effect("leaves non-USD groups on the legacy ledger", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const { alex } = yield* users("alex");
      const usdGroup = yield* groupWith(alex);
      const yen = ids.group();
      yield* alex.groups.create({
        payload: { id: yen, name: "Tokyo", currency: CurrencyCode.make("JPY"), displayName: "A" },
      });
      const tokyo = yield* alex.trips.create({
        params: { groupId: yen },
        payload: { id: ids.trip(), name: "Tokyo" },
      });
      const tokyoGroup = yield* alex.groups.get({ params: { groupId: yen } });
      for (const [tripId, playerId] of [
        [usdGroup.tripId, usdGroup.myPlayerId],
        [tokyo.id, tokyoGroup.myPlayerId],
      ] as const) {
        const sessionId = yield* startSession(alex, tripId, [playerId]);
        yield* entry(alex, sessionId, "buy_in", playerId, 10000);
        yield* entry(alex, sessionId, "cash_out", playerId, 5000);
        yield* alex.sessions.close({ params: { sessionId }, payload: {} });
      }

      const report = yield* LegacyMigration.preflight([usdGroup.group.id, yen]);
      expect(report.blocking).toEqual([]);
      expect(report.excluded.map((issue) => [issue.kind, issue.subjectId])).toEqual([
        ["non_usd_group", yen],
      ]);
      expect(
        yield* LegacyMigration.importLegacy({ scope: [usdGroup.group.id, yen], dryRun: false }),
      ).toEqual({ dryRun: false, identities: 1, tables: 1, visits: 1, entries: 2 });
      yield* expectFaithful(usdGroup.group.id);
      const [left] = yield* sql<{ count: string }>`
        select count(*) from personal_visits v join sessions s on s.id = v.legacy_session_id
        where s.group_id = ${yen}
      `;
      expect(Number(left!.count)).toBe(0);
    }),
  );

  const Op = Schema.Struct({
    kind: Schema.Literals(["buy_in", "cash_out", "adjustment"]),
    player: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 })),
    counterparty: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 }))),
    amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000_000_000 })),
    trip: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
    correction: Schema.Literals(["none", "void", "replace"]),
  });

  it.effect.prop(
    "keeps every result, balance and fact of a random history",
    [Schema.Array(Op).check(Schema.isMinLength(1), Schema.isMaxLength(10))],
    ([ops]) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const { alex, bea } = yield* users("alex", "bea");
        const group = yield* groupWith(alex, bea);
        const groupId = group.group.id;
        const guests = [
          yield* addGuest(alex, groupId, "Gus"),
          yield* addGuest(alex, groupId, "Gus"),
          yield* addGuest(alex, groupId, "Zed"),
        ];
        const players = [group.myPlayerId, group.players[1]!.id, ...guests.map((g) => g.id)];
        const second = yield* alex.trips.create({
          params: { groupId },
          payload: { id: ids.trip(), name: "Reno" },
        });
        const trips = [group.tripId, second.id];
        const sessions = [
          yield* startSession(alex, trips[0]!, [players[0]!]),
          yield* startSession(alex, trips[1]!, [players[1]!]),
        ] as const;

        for (const op of ops) {
          const player = players[op.player]!;
          const other = players[(op.player + (op.counterparty ?? 1)) % 5]!;
          const amount = op.kind === "adjustment" && op.amount % 2 === 0 ? -op.amount : op.amount;
          const counterparty = op.kind === "adjustment" || op.counterparty === null ? null : other;
          const sessionId = sessions[op.trip]!;
          const added = yield* entry(alex, sessionId, op.kind, player, amount, counterparty);
          if (op.correction === "void")
            yield* alex.ledger.voidEntry({
              params: { entryId: added.id },
              payload: { reason: null },
            });
          if (op.correction === "replace")
            yield* entry(
              alex,
              sessionId,
              op.kind,
              player,
              amount + Math.sign(amount),
              counterparty,
              added.id,
            );
        }
        // Close both sessions, cashing out anyone still in for nothing.
        for (const sessionId of sessions) {
          const playing = yield* sql<{ playerId: PlayerId }>`
            select distinct player_id from entries e
            where session_id = ${sessionId} and kind = 'buy_in' and voided_at is null
              and not exists (
                select 1 from entries c where c.session_id = e.session_id
                  and c.player_id = e.player_id and c.kind = 'cash_out' and c.voided_at is null
              )
          `;
          yield* alex.sessions.close({
            params: { sessionId },
            payload: {
              cashOuts: playing.map(({ playerId }) => ({
                id: ids.entry(),
                playerId,
                amount: usd(0),
              })),
            },
          });
        }

        yield* LegacyMigration.importLegacy({ scope: [groupId], dryRun: false });
        yield* expectFaithful(groupId);
        expect(yield* LegacyMigration.importLegacy({ scope: [groupId], dryRun: false })).toEqual(
          nothingNew,
        );
      }),
    { timeout: 120_000, arbitrary: { runs: 8 } },
  );
});
