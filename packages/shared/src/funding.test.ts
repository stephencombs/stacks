import { describe, expect, it } from "@effect/vitest";
import { MinorUnits, PlayerId, SessionId, StakeId, TripId, VisitId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { fundingOf, sessionVisits } from "./funding.ts";
import {
  COVERED_MIN_ENTRIES,
  RELOAD_MIN_VISITS,
  additionalBuyIns,
  backingResults,
  coveredBy,
} from "./stats.ts";
import { stakeLines } from "./stakes.ts";
import { groupTable } from "./tripTables.ts";

const player = (n: number) =>
  PlayerId.make(`0192e7a0-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`);

const ALEX = player(1);
const BEA = player(2);
const CAL = player(3);
const guestId = player(4);

const money = (amount: number) => MinorUnits.make(amount);
const at = (hour: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 14, hour));
const VOIDED = at(23);

const tripId = (n: number) =>
  TripId.make(`0192e7a0-0000-7000-8000-0000000005${String(n).padStart(2, "0")}`);

const play = (n: number) =>
  SessionId.make(`0192e7a0-0000-7000-8000-0000000006${String(n).padStart(2, "0")}`);

const entry = (
  playerId: PlayerId,
  kind: "buy_in" | "cash_out" | "adjustment",
  amount: number,
  fields: { counterpartyId?: PlayerId; voided?: boolean } = {},
) => ({
  kind,
  playerId,
  amount: money(amount),
  counterpartyId: fields.counterpartyId ?? null,
  voidedAt: fields.voided ? VOIDED : null,
});

describe("sessionVisits", () => {
  it("makes one visit per player, counting active buy-ins and what they cashed out", () => {
    expect(
      sessionVisits([
        entry(ALEX, "buy_in", 10000),
        entry(ALEX, "buy_in", 5000, { counterpartyId: BEA }),
        entry(ALEX, "cash_out", 20000),
        entry(BEA, "buy_in", 10000),
      ]),
    ).toEqual([
      { playerId: ALEX, buyIns: 2, net: 5000, covered: [{ payerId: BEA, amount: 5000 }] },
      { playerId: BEA, buyIns: 1, net: -10000, covered: [] },
    ]);
  });

  it("skips voided entries, so a correction counts once and a pure void drops out", () => {
    expect(
      sessionVisits([
        entry(ALEX, "buy_in", 10000),
        entry(ALEX, "buy_in", 5000, { voided: true }),
        entry(ALEX, "buy_in", 6000),
        entry(BEA, "buy_in", 3000, { voided: true }),
      ]),
    ).toEqual([{ playerId: ALEX, buyIns: 2, net: -16000, covered: [] }]);
  });

  it("never counts a player paying for their own buy-in as covered", () => {
    expect(
      sessionVisits([entry(ALEX, "buy_in", 1000, { counterpartyId: ALEX })])[0]!.covered,
    ).toEqual([]);
  });
});

describe("fundingOf", () => {
  const visits = (...rows: Array<ReturnType<typeof entry>>) => sessionVisits(rows);

  it("lists the visits with an additional buy-in, every play's visits and what was covered", () => {
    const funding = fundingOf([
      {
        playId: play(1),
        visits: visits(
          entry(ALEX, "buy_in", 10000),
          entry(ALEX, "buy_in", 10000, { counterpartyId: CAL }),
          entry(ALEX, "cash_out", 30000),
          entry(BEA, "buy_in", 10000),
        ),
      },
      { playId: play(2), visits: [] },
    ]);

    expect(funding.reloads).toEqual([
      { playId: play(1), playerId: ALEX, additional: 1, net: 10000 },
    ]);
    expect(funding.allVisits).toEqual([{ playId: play(1), visits: 2 }]);
    expect(funding.covered).toEqual([
      { playId: play(1), payerId: CAL, playerId: ALEX, amount: 10000 },
    ]);
  });
});

describe("groupTable visits", () => {
  const visitId = (n: number) =>
    VisitId.make(`0192e7a0-0000-7000-8000-0000000007${String(n).padStart(2, "0")}`);

  const visit = (n: number, playerId: PlayerId, finished: number | null = 22, deleted = false) => ({
    id: visitId(n),
    playerId,
    startedAt: at(20),
    finishedAt: finished === null ? null : at(finished),
    deletedAt: deleted ? VOIDED : null,
  });

  const row = (
    n: number,
    kind: "buy_in" | "cash_out",
    amount: number,
    counterpartyId?: PlayerId,
  ) => ({
    visitId: visitId(n),
    kind,
    amount: money(amount),
    voidedAt: null,
    counterpartyId: counterpartyId ?? null,
  });

  const memberOf = (v: { readonly playerId: PlayerId }) =>
    v.playerId === guestId ? null : v.playerId;

  const payerOf = (id: PlayerId) => (id === guestId ? null : id);

  it("keeps each finished member visit apart, so return visits don't make an additional buy-in", () => {
    const table = groupTable(
      [visit(1, ALEX, 21), visit(2, ALEX, 23)],
      [
        row(1, "buy_in", 10000),
        row(1, "cash_out", 5000),
        row(2, "buy_in", 10000),
        row(2, "cash_out", 30000),
      ],
      memberOf,
      payerOf,
    )!;

    expect(table.visits).toEqual([
      { playerId: ALEX, buyIns: 1, net: -5000, covered: [] },
      { playerId: ALEX, buyIns: 1, net: 20000, covered: [] },
    ]);
  });

  it("leaves out open, deleted and unlinked visits, and a payer who doesn't map", () => {
    const table = groupTable(
      [visit(1, ALEX), visit(2, BEA, null), visit(3, CAL, 22, true), visit(4, guestId)],
      [
        row(1, "buy_in", 10000, BEA),
        row(1, "buy_in", 5000, guestId),
        row(1, "buy_in", 2000, ALEX),
        row(2, "buy_in", 10000),
        row(3, "buy_in", 10000),
        row(4, "buy_in", 10000, ALEX),
      ],
      memberOf,
      payerOf,
    )!;

    expect(table.visits).toEqual([
      { playerId: ALEX, buyIns: 3, net: -17000, covered: [{ payerId: BEA, amount: 10000 }] },
    ]);
  });
});

describe("additionalBuyIns", () => {
  const plays = [{ id: play(1) }, { id: play(2) }];

  const reload = (playId: SessionId, playerId: PlayerId, additional: number, net: number) => ({
    playId,
    playerId,
    additional,
    net: money(net),
  });

  const five = [
    reload(play(1), ALEX, 1, 100),
    reload(play(1), BEA, 1, -200),
    reload(play(1), ALEX, 1, 300),
    reload(play(2), CAL, 1, 0),
    reload(play(2), BEA, 3, 400),
  ];

  it("hides below the floor and counts only visits at the plays in scope", () => {
    expect(RELOAD_MIN_VISITS).toBe(5);
    expect(additionalBuyIns(plays, five.slice(0, 4))).toBeNull();
    expect(additionalBuyIns([plays[0]!], five)).toBeNull();
  });

  it("counts the visits that finished up, sums their result and names who added the most", () => {
    expect(additionalBuyIns(plays, five)).toEqual({
      visits: 5,
      finishedUp: 3,
      result: 600,
      most: { playerId: BEA, additional: 4 },
    });
  });

  it("names nobody on a tie for the most", () => {
    const tied = [
      reload(play(1), ALEX, 2, 100),
      reload(play(1), BEA, 1, 100),
      reload(play(1), BEA, 1, 100),
      reload(play(2), CAL, 1, 100),
      reload(play(2), CAL, 1, 100),
    ];

    expect(additionalBuyIns(plays, tied)?.most).toBeNull();
  });
});

describe("coveredBy", () => {
  const plays = [{ id: play(1) }, { id: play(2) }];

  const entry = (playId: SessionId, payerId: PlayerId, playerId: PlayerId, amount: number) => ({
    playId,
    payerId,
    playerId,
    amount: money(amount),
  });

  it("needs two covered entries in scope", () => {
    expect(COVERED_MIN_ENTRIES).toBe(2);
    expect(coveredBy(plays, [entry(play(1), ALEX, BEA, 1000)])).toBeNull();
    expect(
      coveredBy([plays[0]!], [entry(play(1), ALEX, BEA, 1000), entry(play(2), ALEX, BEA, 1000)]),
    ).toBeNull();
  });

  it("picks who paid the most by amount, with their entries and friends", () => {
    expect(
      coveredBy(plays, [
        entry(play(1), ALEX, BEA, 1000),
        entry(play(1), ALEX, CAL, 1500),
        entry(play(2), ALEX, BEA, 500),
        entry(play(2), BEA, ALEX, 2900),
      ]),
    ).toEqual({ payerId: ALEX, entries: 3, friends: 2, amount: 3000 });
  });

  it("hides on a tie for the largest amount", () => {
    expect(
      coveredBy(plays, [entry(play(1), ALEX, BEA, 1000), entry(play(2), BEA, ALEX, 1000)]),
    ).toBeNull();
  });
});

describe("stake lines and backing", () => {
  const stake = (
    n: number,
    fields: { trip?: number; to?: number; voided?: boolean; amount?: number } = {},
  ) => ({
    id: StakeId.make(`0192e7a0-0000-7000-8000-0000000008${String(n).padStart(2, "0")}`),
    tripId: tripId(fields.trip ?? 1),
    lenderId: ALEX,
    borrowerId: BEA,
    amount: money(fields.amount ?? 10000),
    lenderShare: 50,
    startedAt: at(n),
    endedAt: fields.to === undefined ? null : at(fields.to),
    voidedAt: fields.voided ? VOIDED : null,
  });

  const outcomes = (...rows: ReadonlyArray<ReturnType<typeof stake>>) =>
    new Map(rows.map((row) => [row.id, { result: money(0), owed: money(row.amount + 500) }]));

  const sessions = (status: "live" | "closed", trip = 1) => [
    { tripId: tripId(trip), startedAt: at(5), status },
  ];

  it("is final once the stake or its trip has ended and no covered session is live", () => {
    const open = stake(1);
    const ended = stake(2, { to: 12 });
    const inEndedTrip = stake(3, { trip: 2 });
    const rows = [open, ended, inEndedTrip];

    expect(
      stakeLines(rows, outcomes(...rows), sessions("closed"), new Set([tripId(2)])).map(
        (line) => line.final,
      ),
    ).toEqual([false, true, true]);

    expect(
      stakeLines(rows, outcomes(...rows), sessions("live"), new Set([tripId(2)])).map(
        (line) => line.final,
      ),
    ).toEqual([false, false, true]);
  });

  it("leaves out a voided stake and carries what the borrower owes", () => {
    const live = stake(1);
    const voided = stake(2, { voided: true });

    expect(stakeLines([live, voided], outcomes(live), [], new Set())).toEqual([
      {
        stakeId: live.id,
        tripId: live.tripId,
        lenderId: ALEX,
        borrowerId: BEA,
        amount: 10000,
        owed: 10500,
        final: false,
      },
    ]);
  });

  it("lists stakes newest first with the backer's result, and only the trips in scope", () => {
    const lines = [stake(1), stake(2, { trip: 2 }), stake(3, { trip: 2 })].map((row, index) => ({
      stakeId: row.id,
      tripId: row.tripId,
      lenderId: row.lenderId,
      borrowerId: row.borrowerId,
      amount: row.amount,
      owed: money(row.amount + (index === 1 ? -4000 : 500)),
      final: true,
    }));

    expect(
      backingResults(lines, null).map((line) => [line.stakeId.slice(-2), line.result]),
    ).toEqual([
      ["03", 500],
      ["02", -4000],
      ["01", 500],
    ]);
    expect(
      backingResults(lines, new Set([tripId(2)])).map((line) => line.stakeId.slice(-2)),
    ).toEqual(["03", "02"]);
  });
});
