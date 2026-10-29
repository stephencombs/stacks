import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { SessionId, StakeId, TripId } from "@stacks/contracts";

import { balances } from "./balances.ts";
import { stakeOutcomes, withStakes } from "./stakes.ts";
import {
  ALEX,
  BEA,
  CAL,
  RandomLedger,
  entry,
  money,
  toEntries,
} from "./testing/ledgerArbitrary.ts";

const at = (hour: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 22, hour));
const VEGAS = TripId.make("0192e7a0-0000-7000-8000-000000000501");
const RENO = TripId.make("0192e7a0-0000-7000-8000-000000000502");
const session = (n: number, tripId = VEGAS) => ({
  id: SessionId.make(`0192e7a0-0000-7000-8000-0000000002${String(n).padStart(2, "0")}`),
  tripId,
  startedAt: at(n),
});
const stake = (
  n: number,
  fields: {
    lender: typeof ALEX;
    borrower: typeof ALEX;
    amount: number;
    share?: number;
    from?: number;
    to?: number;
    voided?: boolean;
  },
) => ({
  id: StakeId.make(`0192e7a0-0000-7000-8000-0000000003${String(n).padStart(2, "0")}`),
  lenderId: fields.lender,
  borrowerId: fields.borrower,
  amount: money(fields.amount),
  tripId: VEGAS,
  lenderShare: fields.share ?? 50,
  startedAt: at(fields.from ?? 0),
  endedAt: fields.to === undefined ? null : at(fields.to),
  voidedAt: fields.voided ? at(23) : null,
});
/** A net result for a player at a session. */
const won = (n: number, playerId: typeof ALEX, amount: number) => ({
  ...entry({ kind: "adjustment", playerId, amount: money(amount) }),
  sessionId: session(n).id,
});

describe("stakeOutcomes", () => {
  const sessions = [1, 2, 3, 4].map((n) => session(n));
  const nick = BEA;
  const bruce = ALEX;
  const brad = CAL;

  it("hands back the stake plus the backer's share of winnings", () => {
    const s = stake(1, { lender: bruce, borrower: nick, amount: 100000 });
    const out = stakeOutcomes([s], sessions, [won(1, nick, 30000), won(2, nick, 10000)]);
    expect(out.get(s.id)).toEqual({ result: 40000, owed: 120000 });
  });

  it("makes the backer take a loss, but never more than the stake", () => {
    const s = stake(1, { lender: bruce, borrower: nick, amount: 100000 });
    expect(stakeOutcomes([s], sessions, [won(1, nick, -40000)]).get(s.id)).toEqual({
      result: -40000,
      owed: 60000,
    });
    expect(stakeOutcomes([s], sessions, [won(1, nick, -150000)]).get(s.id)).toEqual({
      result: -150000,
      owed: 0,
    });
  });

  it("counts only sessions in the stake's own trip", () => {
    const s = stake(1, { lender: bruce, borrower: nick, amount: 100000 });
    const out = stakeOutcomes(
      [s],
      [session(1), session(2, RENO)],
      [won(1, nick, 1000), won(2, nick, 99900)],
    );
    expect(out.get(s.id)).toEqual({ result: 1000, owed: 100500 });
  });

  it("counts only sessions that start while the stake is open", () => {
    const s = stake(1, { lender: bruce, borrower: nick, amount: 100000, from: 2, to: 4 });
    const out = stakeOutcomes([s], sessions, [
      won(1, nick, 99900),
      won(2, nick, 1000),
      won(3, nick, 2000),
      won(4, nick, 99900),
    ]);
    expect(out.get(s.id)?.result).toBe(3000);
  });

  it("splits a borrower's result between backers by what each put in, at each one's share", () => {
    const fromBruce = stake(1, { lender: bruce, borrower: nick, amount: 100000 });
    const fromBrad = stake(2, { lender: brad, borrower: nick, amount: 300000, share: 30 });
    const out = stakeOutcomes([fromBruce, fromBrad], sessions, [won(1, nick, 40000)]);
    expect(out.get(fromBruce.id)).toEqual({ result: 10000, owed: 105000 });
    expect(out.get(fromBrad.id)).toEqual({ result: 30000, owed: 309000 });
  });

  it("ignores voided stakes and other players' results", () => {
    const voided = stake(1, { lender: bruce, borrower: nick, amount: 100000, voided: true });
    const open = stake(2, { lender: bruce, borrower: nick, amount: 100000 });
    const out = stakeOutcomes([voided, open], sessions, [won(1, nick, 2000), won(1, brad, 77700)]);
    expect(out.has(voided.id)).toBe(false);
    expect(out.get(open.id)).toEqual({ result: 2000, owed: 101000 });
  });

  it("puts what the borrower owes into balances", () => {
    const s = stake(1, { lender: bruce, borrower: nick, amount: 100000 });
    const outcomes = stakeOutcomes([s], sessions, [won(1, nick, 40000)]);
    expect(withStakes(new Map(), [s], outcomes)).toEqual(
      new Map([
        [bruce, 120000],
        [nick, -120000],
      ]),
    );
  });

  const RandomStakes = Schema.Array(
    Schema.Struct({
      lender: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 })),
      offset: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
      amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000_000 })),
      share: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
      from: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
      length: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
    }),
  );

  it.prop(
    "splits results without losing or inventing money, and keeps balances summing to zero",
    [RandomLedger, RandomStakes],
    ([ledger, randomStakes]) => {
      const ledgerEntries = toEntries(ledger).map((e, i) => ({
        ...e,
        sessionId: session((i % 4) + 1).id,
      }));
      const players = [ALEX, BEA, CAL, ...new Set(ledgerEntries.map((e) => e.playerId))];
      const stakes = randomStakes
        .map((s, i) =>
          stake(i, {
            lender: players[s.lender % players.length]!,
            borrower: players[(s.lender + s.offset) % players.length]!,
            amount: s.amount,
            share: s.share,
            from: s.from,
            ...(s.length === null ? {} : { to: s.from + s.length }),
          }),
        )
        .filter((s) => s.lenderId !== s.borrowerId);
      const outcomes = stakeOutcomes(stakes, sessions, ledgerEntries);

      for (const s of stakes) {
        const { result, owed } = outcomes.get(s.id)!;
        expect(Number.isInteger(owed) && owed >= 0).toBe(true);
        if (result >= 0) expect(owed).toBeGreaterThanOrEqual(s.amount);
        else expect(owed).toBe(Math.max(0, s.amount + result));
      }

      // Each covered result is shared out in full across the stakes open at that session.
      for (const borrower of new Set(stakes.map((s) => s.borrowerId))) {
        const mine = stakes.filter((s) => s.borrowerId === borrower);
        const covered = sessions.filter((sess) =>
          mine.some(
            (s) =>
              DateTime.toEpochMillis(s.startedAt) <= DateTime.toEpochMillis(sess.startedAt) &&
              (s.endedAt === null ||
                DateTime.toEpochMillis(sess.startedAt) < DateTime.toEpochMillis(s.endedAt)),
          ),
        );
        const coveredResult = ledgerEntries
          .filter(
            (e) =>
              e.playerId === borrower &&
              e.voidedAt === null &&
              e.kind !== "settlement" &&
              covered.some((sess) => sess.id === e.sessionId),
          )
          .reduce((sum, e) => sum + (e.kind === "buy_in" ? -e.amount : e.amount), 0);
        expect(mine.reduce((sum, s) => sum + outcomes.get(s.id)!.result, 0)).toBe(coveredResult);
      }

      const total = withStakes(balances(ledgerEntries), stakes, outcomes);
      expect(Array.from(total.values()).reduce((sum, amount) => sum + amount, 0)).toBe(0);
      expect(Array.from(total.values())).not.toContain(0);
    },
  );
});
