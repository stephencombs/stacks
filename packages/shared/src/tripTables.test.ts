import { describe, expect, it } from "@effect/vitest";
import { PlayerId, VisitId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import { ALEX, BEA, money } from "./testing/ledgerArbitrary.ts";
import { groupTable, inGroupAt, type TableEntry, type TableVisit } from "./tripTables.ts";

const tablePlayer = (n: number) =>
  PlayerId.make(`0192e7a0-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`);
const visitId = (n: number) =>
  VisitId.make(`0192e7a0-0000-7000-8000-0000000002${String(n).padStart(2, "0")}`);
const at = (hour: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 14, hour));
const VOIDED = at(23);

const visit = (
  n: number,
  player: PlayerId,
  hours: readonly [number, number | null],
  deleted = false,
): TableVisit => ({
  id: visitId(n),
  playerId: player,
  startedAt: at(hours[0]),
  finishedAt: hours[1] === null ? null : at(hours[1]),
  // The API reads a kept visit with a null deletion, the device with none at all.
  ...(deleted ? { deletedAt: VOIDED } : n % 2 === 0 ? { deletedAt: null } : {}),
});

const entry = (
  n: number,
  kind: TableEntry["kind"],
  amount: number,
  voided = false,
): TableEntry => ({
  visitId: visitId(n),
  kind,
  amount: money(amount),
  voidedAt: voided ? VOIDED : null,
});

const DAVE = tablePlayer(1);
const ERIN = tablePlayer(2);
const ALEX_AT_TABLE = tablePlayer(3);
const ALEX_CLAIMED = tablePlayer(4);

describe("groupTable", () => {
  it("counts a linked player's return visits once, under their group member", () => {
    const table = groupTable(
      [
        visit(1, ALEX_AT_TABLE, [20, 21]),
        visit(2, DAVE, [20, 22]),
        visit(3, ALEX_AT_TABLE, [21, 23]),
      ],
      [
        entry(1, "buy_in", 10000),
        entry(1, "cash_out", 4000),
        entry(2, "buy_in", 5000),
        entry(2, "cash_out", 9000),
        entry(3, "buy_in", 10000),
        entry(3, "cash_out", 25000),
      ],
      (v) => (v.playerId === ALEX_AT_TABLE ? ALEX : null),
    )!;
    expect(table.results).toEqual([
      { playerId: ALEX, buyIn: 20000, cashOut: 29000, adjustment: 0, net: 9000 },
    ]);
    expect(table.others).toEqual([
      { playerId: DAVE, playing: false, buyIn: 5000, cashOut: 9000, adjustment: 0, net: 4000 },
    ]);
    expect(table.startedAt).toEqual(at(20));
    expect(table.endedAt).toEqual(at(23));
    expect(table.inPlay).toEqual([]);
    // Someone was playing from 8pm to 11pm: three hours, not the five the visits add up to.
    expect(table.minutesPlayed).toBe(180);
  });

  it("keeps a cashed-out visit settled while the player is back at the table", () => {
    const table = groupTable(
      [visit(1, ALEX_AT_TABLE, [20, 21]), visit(2, ALEX_AT_TABLE, [22, null])],
      [
        entry(1, "buy_in", 10000),
        entry(1, "cash_out", 15000),
        entry(2, "buy_in", 10000),
        entry(2, "buy_in", 2500),
      ],
      () => ALEX,
    )!;
    expect(table.seated).toEqual([ALEX]);
    expect(table.results).toEqual([
      { playerId: ALEX, buyIn: 10000, cashOut: 15000, adjustment: 0, net: 5000 },
    ]);
    expect(table.inPlay).toEqual([{ playerId: ALEX, buyIn: 12500 }]);
    expect(table.endedAt).toBeNull();
    // An hour from 8pm, and the open visit not yet.
    expect(table.minutesPlayed).toBe(60);
  });

  it("merges two table players linked to the same member", () => {
    const table = groupTable(
      [visit(1, ALEX_AT_TABLE, [20, 21]), visit(2, ALEX_CLAIMED, [21, 22])],
      [entry(1, "buy_in", 100), entry(2, "buy_in", 200), entry(2, "adjustment", 50)],
      () => ALEX,
    )!;
    expect(table.results).toEqual([
      { playerId: ALEX, buyIn: 300, cashOut: 0, adjustment: 50, net: -250 },
    ]);
    expect(table.others).toEqual([]);
  });

  it("leaves a visit that counts for no one on the table only", () => {
    // The same table player counts for a member before they left, and for no one after.
    const table = groupTable(
      [visit(1, ALEX_AT_TABLE, [20, 21]), visit(2, ALEX_AT_TABLE, [22, 23])],
      [entry(1, "buy_in", 100), entry(2, "buy_in", 300), entry(2, "cash_out", 1000)],
      (v) => (v.id === visitId(1) ? ALEX : null),
    )!;
    expect(table.results).toEqual([
      { playerId: ALEX, buyIn: 100, cashOut: 0, adjustment: 0, net: -100 },
    ]);
    expect(table.others).toEqual([
      {
        playerId: ALEX_AT_TABLE,
        playing: false,
        buyIn: 300,
        cashOut: 1000,
        adjustment: 0,
        net: 700,
      },
    ]);
  });

  it("ignores voided entries and deleted visits", () => {
    const table = groupTable(
      [visit(1, DAVE, [20, 21]), visit(2, ERIN, [20, 21], true)],
      [entry(1, "buy_in", 100), entry(1, "buy_in", 900, true), entry(2, "buy_in", 500)],
      () => null,
    )!;
    expect(table.others.map((o) => [o.playerId, o.net])).toEqual([[DAVE, -100]]);
    expect(
      groupTable([visit(2, ERIN, [20, 21], true)], [entry(2, "buy_in", 500)], () => null),
    ).toBeNull();
  });

  it("stays open while anyone is still playing, and lists who", () => {
    const table = groupTable(
      [visit(1, ALEX_AT_TABLE, [20, null]), visit(2, DAVE, [19, 21]), visit(3, ERIN, [21, null])],
      [entry(1, "buy_in", 100), entry(2, "buy_in", 100), entry(3, "buy_in", 100)],
      (v) => (v.playerId === ALEX_AT_TABLE ? ALEX : null),
    )!;
    expect(table.startedAt).toEqual(at(19));
    expect(table.endedAt).toBeNull();
    expect(table.inPlay).toEqual([{ playerId: ALEX, buyIn: 100 }]);
    expect(table.results).toEqual([]);
    expect(table.others.map((o) => [o.playerId, o.playing, o.net])).toEqual([
      [DAVE, false, -100],
      [ERIN, true, 0],
    ]);
  });

  it("seats a member with no money in play and no result yet", () => {
    const table = groupTable([visit(1, ALEX_AT_TABLE, [20, null])], [], () => BEA)!;
    expect(table.seated).toEqual([BEA]);
    expect(table.results).toEqual([]);
    expect(table.inPlay).toEqual([{ playerId: BEA, buyIn: 0 }]);
  });

  const Ledger = Schema.Struct({
    visits: Schema.Array(
      Schema.Struct({
        player: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
        start: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 })),
        finished: Schema.Boolean,
        deleted: Schema.Boolean,
        // Which member this visit counts for, if any.
        member: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
      }),
    ),
    entries: Schema.Array(
      Schema.Struct({
        visit: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 })),
        kind: Schema.Literals(["buy_in", "cash_out", "adjustment"]),
        amount: Schema.Int.check(Schema.isBetween({ minimum: -10_000_000, maximum: 10_000_000 })),
        voided: Schema.Boolean,
      }),
    ),
  });

  it.prop("splits every counted dollar between members and others, once", [Ledger], ([ledger]) => {
    const members = [ALEX, BEA];
    const visits = ledger.visits.map((v, n) =>
      visit(n, tablePlayer(v.player), [v.start, v.finished ? v.start + 1 : null], v.deleted),
    );
    const entries = ledger.entries.map((e) =>
      entry(e.visit, e.kind, e.kind === "adjustment" ? e.amount : Math.abs(e.amount), e.voided),
    );
    const memberOf = (v: TableVisit) => {
      const index = ledger.visits[visits.indexOf(v)]!.member;
      return index === null ? null : members[index]!;
    };
    const table = groupTable(visits, entries, memberOf);
    const shown = ledger.visits.flatMap((v, n) => (v.deleted ? [] : [n]));
    if (shown.length === 0) return expect(table).toBeNull();

    const counted = ledger.entries.filter(
      (e) =>
        !e.voided &&
        e.visit < visits.length &&
        !ledger.visits[e.visit]!.deleted &&
        ledger.visits[e.visit]!.finished,
    );
    const open = ledger.entries.filter(
      (e) =>
        !e.voided &&
        e.kind === "buy_in" &&
        e.visit < visits.length &&
        !ledger.visits[e.visit]!.deleted &&
        !ledger.visits[e.visit]!.finished &&
        ledger.visits[e.visit]!.member !== null,
    );
    const sum = (rows: ReadonlyArray<{ net: number; buyIn: number }>) =>
      rows.reduce((total, row) => [total[0]! + row.net, total[1]! + row.buyIn], [0, 0]);
    const [net, buyIn] = sum([...table!.results, ...table!.others]);
    expect(net).toBe(
      counted.reduce(
        (total, e) =>
          total +
          (e.kind === "buy_in"
            ? -Math.abs(e.amount)
            : e.kind === "cash_out"
              ? Math.abs(e.amount)
              : e.amount),
        0,
      ),
    );
    expect(buyIn).toBe(
      counted
        .filter((e) => e.kind === "buy_in")
        .reduce((total, e) => total + Math.abs(e.amount), 0),
    );
    expect(table!.inPlay.reduce((total, row) => total + row.buyIn, 0)).toBe(
      open.reduce((total, e) => total + Math.abs(e.amount), 0),
    );
    for (const row of [...table!.results, ...table!.others])
      expect(Number.isInteger(row.net)).toBe(true);
    expect(new Set(table!.results.map((m) => m.playerId)).size).toBe(table!.results.length);
    expect(new Set(table!.others.map((o) => o.playerId)).size).toBe(table!.others.length);
    expect(table!.endedAt === null).toBe(shown.some((n) => !ledger.visits[n]!.finished));
    for (const row of [...table!.results, ...table!.inPlay])
      expect(table!.seated).toContain(row.playerId);
    // Finished visits each last an hour; the union can't exceed their sum or fall below one.
    const finished = shown.filter((n) => ledger.visits[n]!.finished);
    expect(table!.minutesPlayed).toBeLessThanOrEqual(finished.length * 60);
    expect(table!.minutesPlayed).toBeGreaterThanOrEqual(finished.length > 0 ? 60 : 0);
  });
});

describe("inGroupAt", () => {
  const membership = {
    leftAt: at(22),
    absences: [{ leftAt: at(12), returnedAt: at(15) }],
  };

  it("counts play while a member is in the group, and not while they're out", () => {
    expect(inGroupAt(at(11), membership)).toBe(true);
    expect(inGroupAt(at(12), membership)).toBe(false);
    expect(inGroupAt(at(14), membership)).toBe(false);
    expect(inGroupAt(at(15), membership)).toBe(true);
    expect(inGroupAt(at(21), membership)).toBe(true);
    expect(inGroupAt(at(22), membership)).toBe(false);
    expect(inGroupAt(at(23), { leftAt: null, absences: membership.absences })).toBe(true);
  });
});
