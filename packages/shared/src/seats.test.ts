import { describe, expect, it } from "@effect/vitest";
import { ActorId, SeatingId, VisitId, VisitSeating } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import {
  normalizeTableSeats,
  seatCount,
  seatsNow,
  sortSeatings,
  tableLiveSeats,
  visitSeatNow,
  visitSeatOutcome,
} from "./seats.ts";
import { ALEX, BEA, CAL } from "./testing/ledgerArbitrary.ts";

let sequence = 1;
const uuid = () => `0192e7a0-0000-7000-8000-${(sequence++).toString(16).padStart(12, "0")}`;
const ACTOR = ActorId.make("0192e7a0-0000-7000-8000-0000000000aa");
const VISIT_A = VisitId.make("0192e7a0-0000-7000-8000-0000000000b1");
const VISIT_B = VisitId.make("0192e7a0-0000-7000-8000-0000000000b2");
const VISIT_C = VisitId.make("0192e7a0-0000-7000-8000-0000000000b3");

const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 22, 21, minute));

const sit = (playerId: typeof ALEX, seat: number | null, minute: number) => ({
  playerId,
  seat,
  occurredAt: at(minute),
});

const seating = (
  visitId: VisitId,
  seat: number | null,
  occurredAt: number,
  options: { readonly createdAt?: number; readonly voidedAt?: number | null } = {},
) => {
  const created = at(options.createdAt ?? occurredAt);

  const voidedAt =
    options.voidedAt === undefined || options.voidedAt === null ? null : at(options.voidedAt);

  return VisitSeating.make({
    id: SeatingId.make(uuid()),
    visitId,
    seat,
    occurredAt: at(occurredAt),
    createdBy: ACTOR,
    createdAt: created,
    voidedAt,
    voidedBy: voidedAt === null ? null : ACTOR,
    voidReason: voidedAt === null ? null : "Moved",
  });
};

describe("seatsNow", () => {
  it("follows each player's latest sit, move or stand", () => {
    const now = seatsNow([
      sit(ALEX, 7, 0),
      sit(BEA, 4, 1),
      sit(CAL, 1, 2),
      sit(ALEX, 6, 30),
      sit(CAL, null, 40),
    ]);

    expect([...now]).toEqual([
      [ALEX, 6],
      [BEA, 4],
    ]);
  });

  it("is empty before anyone sits", () => {
    expect(seatsNow([]).size).toBe(0);
  });
});

describe("table sizes and visit seatings", () => {
  it("computes seat counts and validates blackjack table sizes", () => {
    expect(seatCount({ game: null })).toBeNull();
    expect(seatCount({ game: "poker_cash", tableSeats: 6 })).toBeNull();
    expect(seatCount({ game: "other", tableSeats: 5 })).toBeNull();
    expect(seatCount({ game: "blackjack" })).toBe(5);
    expect(seatCount({ game: "blackjack", tableSeats: null })).toBe(5);
    expect(seatCount({ game: "blackjack", tableSeats: 7 })).toBe(7);

    expect(normalizeTableSeats(null, 5)).toBeNull();
    expect(normalizeTableSeats("poker_cash", 7)).toBeNull();
    expect(normalizeTableSeats("blackjack", null)).toBeNull();
    expect(normalizeTableSeats("blackjack", undefined)).toBeNull();
    expect(normalizeTableSeats("blackjack", 6)).toBe(6);
    expect(() => normalizeTableSeats("blackjack", 4)).toThrow(RangeError);
    expect(() => normalizeTableSeats("blackjack", 8)).toThrow(RangeError);
  });

  it("orders seatings deterministically and ignores voided rows in visitSeatNow", () => {
    const first = seating(VISIT_A, 2, 10, { createdAt: 10 });
    const tiedLaterCreated = seating(VISIT_A, 5, 10, { createdAt: 11 });
    const voidedLater = seating(VISIT_A, 4, 20, { voidedAt: 21 });

    expect(sortSeatings([voidedLater, tiedLaterCreated, first]).map((row) => row.id)).toEqual([
      first.id,
      tiedLaterCreated.id,
      voidedLater.id,
    ]);
    expect(visitSeatNow([voidedLater, tiedLaterCreated, first])).toBe(5);
    expect(visitSeatNow([seating(VISIT_A, 3, 10), seating(VISIT_A, null, 15)])).toBeNull();
    expect(visitSeatNow([voidedLater])).toBeNull();
  });

  it("classifies visitSeatOutcome for stats, excluding trailing stand-ups and voided rows", () => {
    expect(visitSeatOutcome([])).toEqual({ kind: "none" });
    expect(visitSeatOutcome([seating(VISIT_A, 3, 10, { voidedAt: 11 })])).toEqual({
      kind: "none",
    });
    expect(visitSeatOutcome([seating(VISIT_A, null, 10)])).toEqual({ kind: "none" });
    expect(visitSeatOutcome([seating(VISIT_A, 3, 10), seating(VISIT_A, null, 20)])).toEqual({
      kind: "none",
    });
    expect(
      visitSeatOutcome([
        seating(VISIT_A, 3, 10),
        seating(VISIT_A, null, 15),
        seating(VISIT_A, 3, 20),
      ]),
    ).toEqual({ kind: "seat", seat: 3 });
    expect(
      visitSeatOutcome([
        seating(VISIT_A, 2, 5, { voidedAt: 6 }),
        seating(VISIT_A, 4, 10),
        seating(VISIT_A, 4, 15),
      ]),
    ).toEqual({ kind: "seat", seat: 4 });
    expect(
      visitSeatOutcome([
        seating(VISIT_A, 2, 10),
        seating(VISIT_A, null, 15),
        seating(VISIT_A, 5, 20),
      ]),
    ).toEqual({ kind: "multiple", seats: [2, 5] });
  });

  it("tracks live occupied seats only and breaks reopen/restore overlaps by latest seating", () => {
    const earlierLive = seating(VISIT_A, 3, 10, { createdAt: 10 });
    const overlappingReopened = seating(VISIT_B, 3, 25, { createdAt: 25 });
    const standingNow = seating(VISIT_C, 4, 15);
    const stoodUp = seating(VISIT_C, null, 30);
    const finishedId = VisitId.make(uuid());
    const deletedId = VisitId.make(uuid());

    const visits = [
      { id: VISIT_A, finishedAt: null },
      { id: VISIT_B, finishedAt: null },
      { id: VISIT_C, finishedAt: null },
      { id: finishedId, finishedAt: at(40) },
      { id: deletedId, finishedAt: null, deletedAt: at(45) },
    ];

    const seatings = [
      earlierLive,
      overlappingReopened,
      standingNow,
      stoodUp,
      seating(finishedId, 1, 5),
      seating(deletedId, 2, 6),
    ];

    expect([...tableLiveSeats(visits, seatings)]).toEqual([[3, VISIT_B]]);
    expect([...tableLiveSeats(visits, seatings.toReversed())]).toEqual([[3, VISIT_B]]);
  });

  it.prop(
    "matches visitSeatOutcome invariants across arbitrary seating histories",
    [
      Schema.Array(
        Schema.Struct({
          seat: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 7 }))),
          voided: Schema.Boolean,
        }),
      ),
    ],
    ([steps]) => {
      const rows = steps.map((step, index) =>
        seating(VISIT_A, step.seat, index * 2, {
          voidedAt: step.voided ? index * 2 + 1 : null,
        }),
      );

      const standing = rows.filter((row) => row.voidedAt === null);
      const distinct: Array<number> = [];

      for (const row of standing)
        if (row.seat !== null && !distinct.includes(row.seat)) distinct.push(row.seat);

      const outcome = visitSeatOutcome(rows.toReversed());

      if (standing.length === 0 || distinct.length === 0 || standing.at(-1)!.seat === null) {
        if (distinct.length < 2) expect(outcome).toEqual({ kind: "none" });
        else expect(outcome).toEqual({ kind: "multiple", seats: distinct });
      } else if (distinct.length === 1) {
        expect(outcome).toEqual({ kind: "seat", seat: distinct[0]! });
      } else {
        expect(outcome).toEqual({ kind: "multiple", seats: distinct });
      }
    },
  );
});
