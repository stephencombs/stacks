import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  MinorUnits,
  PlayerId,
  PlayerIdentity,
  TableId,
  TripId,
  VisitId,
  type FinancialContribution,
} from "@stacks/contracts";

import { financialContributions, netObligations, pairBalances } from "./pairBalances.ts";
import {
  ACTOR,
  ALEX,
  AT,
  BEA,
  CAL,
  LATER,
  entryId,
  play,
  repayment,
  table,
  visit,
} from "./testing/recording.ts";

const debt = (
  debtorId = ALEX,
  creditorId = BEA,
  amount = 10000,
  id = 1,
): FinancialContribution => ({
  debtorId,
  creditorId,
  amount: MinorUnits.make(amount),
  source: {
    kind: "play",
    entryId: entryId(id),
    visitId: visit.id,
    tableId: table.id,
    tripId: null,
  },
});
const contributions = (
  entries = [play({ amount: MinorUnits.make(10000), counterpartyId: BEA })],
  repayments: ReadonlyArray<ReturnType<typeof repayment>> = [],
) => financialContributions({ tables: [table], visits: [visit], entries, repayments });

describe("financialContributions", () => {
  it("directs covered buy-ins and held cash-outs oppositely", () => {
    expect(netObligations(contributions())).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 10000 },
    ]);
    expect(
      netObligations(
        contributions([
          play({ kind: "cash_out", amount: MinorUnits.make(30000), counterpartyId: BEA }),
        ]),
      ),
    ).toEqual([{ debtorId: BEA, creditorId: ALEX, amount: 30000 }]);
  });

  it("does not create debt for own money, adjustments, zero or voided facts", () => {
    expect(
      contributions([
        play(),
        play({ id: entryId(2), kind: "cash_out" }),
        play({ id: entryId(3), kind: "adjustment", amount: MinorUnits.make(-300) }),
        play({ id: entryId(4), kind: "cash_out", amount: MinorUnits.make(0), counterpartyId: BEA }),
        play({ id: entryId(5), counterpartyId: BEA, voidedAt: LATER, voidedBy: ACTOR }),
      ]),
    ).toEqual([]);
  });

  it("applies partial repayments and reverses the pair after overpayment", () => {
    expect(
      netObligations(contributions(undefined, [repayment({ amount: MinorUnits.make(4000) })])),
    ).toEqual([{ debtorId: ALEX, creditorId: BEA, amount: 6000 }]);
    expect(
      netObligations(contributions(undefined, [repayment({ amount: MinorUnits.make(10000) })])),
    ).toEqual([]);
    expect(
      netObligations(contributions(undefined, [repayment({ amount: MinorUnits.make(14000) })])),
    ).toEqual([{ debtorId: BEA, creditorId: ALEX, amount: 4000 }]);
  });

  it("changes only a repayment's two endpoints in a native three-player chain", () => {
    const friend = {
      ...visit,
      id: VisitId.make("0192e7a0-0000-7000-8000-0000000000b2"),
      playerId: BEA,
    };
    const source = financialContributions({
      tables: [table],
      visits: [visit, friend],
      entries: [
        play({ amount: MinorUnits.make(10000), counterpartyId: BEA }),
        play({
          id: entryId(2),
          visitId: friend.id,
          amount: MinorUnits.make(10000),
          counterpartyId: CAL,
        }),
      ],
      repayments: [repayment({ amount: MinorUnits.make(4000) })],
    });
    expect(netObligations(source)).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 6000 },
      { debtorId: BEA, creditorId: CAL, amount: 10000 },
    ]);
  });

  it("keeps correction provenance while excluding voided play and repayments", () => {
    const original = play({ counterpartyId: BEA, voidedAt: LATER, voidedBy: ACTOR });
    const replacement = play({
      id: entryId(2),
      counterpartyId: BEA,
      amount: MinorUnits.make(24000),
      replacesEntryId: original.id,
    });
    const paid = repayment({ voidedAt: LATER, voidedBy: ACTOR });
    const corrected = repayment({
      id: entryId(101),
      amount: MinorUnits.make(4000),
      replacesEntryId: paid.id,
    });
    const result = contributions([original, replacement], [paid, corrected]);
    expect(result.map((item) => item.source.entryId)).toEqual([replacement.id, corrected.id]);
    expect(netObligations(result)).toEqual([{ debtorId: ALEX, creditorId: BEA, amount: 20000 }]);
    expect(original.voidedAt).toBe(LATER);
  });

  it("retains Trip-generated debt independently of repayments and unrelated play", () => {
    const tripId = TripId.make("0192e7a0-0000-7000-8000-0000000000d1");
    const vegas = { ...table, tripId };
    const elsewhere = { ...table, id: TableId.make("0192e7a0-0000-7000-8000-0000000000a2") };
    const otherVisit = {
      ...visit,
      id: VisitId.make("0192e7a0-0000-7000-8000-0000000000b2"),
      tableId: elsewhere.id,
    };
    const source = financialContributions({
      tables: [vegas, elsewhere],
      visits: [visit, otherVisit],
      entries: [
        play({ amount: MinorUnits.make(10000), counterpartyId: BEA }),
        play({
          id: entryId(2),
          visitId: otherVisit.id,
          amount: MinorUnits.make(5000),
          counterpartyId: BEA,
        }),
      ],
      repayments: [repayment({ amount: MinorUnits.make(8000), recordedFromTripId: tripId })],
    });
    expect(netObligations(source)).toEqual([{ debtorId: ALEX, creditorId: BEA, amount: 7000 }]);
    expect(
      netObligations(
        source.filter(({ source }) => source.kind === "play" && source.tripId === tripId),
      ),
    ).toEqual([{ debtorId: ALEX, creditorId: BEA, amount: 10000 }]);
    expect(source[2]?.source).toMatchObject({ kind: "repayment", recordedFromTripId: tripId });
  });

  it("rejects missing provenance, self-counterparties and duplicate source IDs", () => {
    expect(() =>
      financialContributions({ tables: [table], visits: [], entries: [play()], repayments: [] }),
    ).toThrow();
    expect(() =>
      financialContributions({ tables: [], visits: [visit], entries: [play()], repayments: [] }),
    ).toThrow();
    expect(() => contributions([play({ counterpartyId: ALEX })])).toThrow();
    expect(() => contributions([play(), play()])).toThrow();
    expect(() =>
      financialContributions({
        tables: [table, { ...table, tripId: TripId.make("0192e7a0-0000-7000-8000-0000000000d1") }],
        visits: [visit],
        entries: [play()],
        repayments: [],
      }),
    ).toThrow();
    expect(() =>
      financialContributions({
        tables: [table],
        visits: [visit, { ...visit, playerId: BEA }],
        entries: [play()],
        repayments: [],
      }),
    ).toThrow();
  });
});

describe("netObligations", () => {
  it("keeps a chain and a cycle intact without third-party rerouting", () => {
    const chain = [debt(), debt(BEA, CAL, 10000, 2)];
    expect(netObligations(chain)).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 10000 },
      { debtorId: BEA, creditorId: CAL, amount: 10000 },
    ]);
    const cycle = [...chain, debt(CAL, ALEX, 10000, 3)];
    expect(netObligations(cycle)).toHaveLength(3);
    expect(netObligations([...cycle, debt(BEA, ALEX, 4000, 4)])).toContainEqual({
      debtorId: ALEX,
      creditorId: BEA,
      amount: 6000,
    });
    expect(netObligations([...cycle, debt(BEA, ALEX, 4000, 4)])).toContainEqual({
      debtorId: BEA,
      creditorId: CAL,
      amount: 10000,
    });
  });

  it("distinguishes players by ID even when their names match", () => {
    const first = PlayerIdentity.make({ id: ALEX, displayName: "Alex" });
    const second = PlayerIdentity.make({ id: BEA, displayName: "Alex" });
    expect(netObligations([debt(first.id, second.id)])).toHaveLength(1);
  });

  it("accumulates exactly before checking the final pair amount", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const source = [debt(ALEX, BEA, max), debt(ALEX, BEA, 2, 2), debt(BEA, ALEX, max, 3)];
    expect(netObligations(source)).toEqual([{ debtorId: ALEX, creditorId: BEA, amount: 2 }]);
    expect(netObligations(source.toReversed())).toEqual(netObligations(source));
    expect(() => netObligations([debt(ALEX, BEA, max), debt(ALEX, BEA, 1, 2)])).toThrow();
  });

  const RandomContributions = Schema.Array(
    Schema.Struct({
      pair: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 })),
      reverse: Schema.Boolean,
      amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000000 })),
    }),
  );
  const pairs = [
    [ALEX, BEA],
    [BEA, CAL],
    [CAL, ALEX],
  ] as const;

  it.prop(
    "is permutation invariant, conserves endpoints and only cancels within a pair",
    [RandomContributions],
    ([random]) => {
      const source = random.map(({ pair, reverse, amount }, i) => {
        const [a, b] = pairs[pair]!;
        return debt(reverse ? b : a, reverse ? a : b, amount, i + 1);
      });
      const result = netObligations(source);
      expect(netObligations(source.toReversed())).toEqual(result);
      for (const playerId of [ALEX, BEA, CAL]) {
        const net = (
          facts: Iterable<{
            readonly debtorId: typeof ALEX;
            readonly creditorId: typeof ALEX;
            readonly amount: number;
          }>,
        ) =>
          Array.from(facts).reduce(
            (sum, fact) =>
              sum +
              (fact.creditorId === playerId
                ? fact.amount
                : fact.debtorId === playerId
                  ? -fact.amount
                  : 0),
            0,
          );
        expect(net(result)).toBe(net(source));
      }
      for (const [a, b] of pairs) {
        const pairSource = source.filter(
          ({ debtorId, creditorId }) =>
            (debtorId === a && creditorId === b) || (debtorId === b && creditorId === a),
        );
        expect(
          result.filter(
            ({ debtorId, creditorId }) =>
              (debtorId === a && creditorId === b) || (debtorId === b && creditorId === a),
          ),
        ).toEqual(netObligations(pairSource));
      }
      expect(
        netObligations(
          source.flatMap((fact) => [
            fact,
            { ...fact, debtorId: fact.creditorId, creditorId: fact.debtorId },
          ]),
        ),
      ).toEqual([]);
      expect(
        result.every(({ amount, debtorId, creditorId }) => amount > 0 && debtorId !== creditorId),
      ).toBe(true);
    },
  );
});

describe("pairBalances", () => {
  const alexPlays = (fields: Parameters<typeof play>[0] = {}) => ({
    ...play(fields),
    playerId: ALEX,
  });

  it("follows the PLAN examples", () => {
    // Bea covers Alex's $100 buy-in: Alex owes Bea $100.
    const covered = alexPlays({ amount: MinorUnits.make(10000), counterpartyId: BEA });
    expect(pairBalances([covered], [])).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 10000 },
    ]);
    // Bea receives Alex's $300 cash-out: Bea owes Alex $300.
    const held = alexPlays({
      id: entryId(2),
      kind: "cash_out",
      amount: MinorUnits.make(30000),
      counterpartyId: BEA,
    });
    expect(pairBalances([held], [])).toEqual([{ debtorId: BEA, creditorId: ALEX, amount: 30000 }]);
    // Alex repays Bea $50: their running balance moves by $50.
    const paid = repayment({ amount: MinorUnits.make(5000) });
    expect(pairBalances([covered], [paid])).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 5000 },
    ]);
    // A player's own buy-in or cash-out creates no debt.
    expect(
      pairBalances([alexPlays(), alexPlays({ id: entryId(3), kind: "cash_out" })], []),
    ).toEqual([]);
  });

  it("counts only the replacement after a void, and keeps the original", () => {
    const original = repayment({
      amount: MinorUnits.make(5000),
      voidedAt: LATER,
      voidedBy: ACTOR,
      voidReason: "Wrong amount",
    });
    const replacement = repayment({
      id: entryId(101),
      amount: MinorUnits.make(3000),
      replacesEntryId: original.id,
    });
    const covered = alexPlays({ amount: MinorUnits.make(10000), counterpartyId: BEA });
    expect(pairBalances([covered], [original, replacement])).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 7000 },
    ]);
    expect(pairBalances([covered], [original])).toEqual([
      { debtorId: ALEX, creditorId: BEA, amount: 10000 },
    ]);
  });

  const players = [ALEX, BEA, CAL, PlayerId.make("0192e7a0-0000-7000-8000-000000000009")];
  const Facts = Schema.Array(
    Schema.Struct({
      from: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
      to: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
      kind: Schema.Literals(["buy_in", "cash_out", "repayment"]),
      amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000000 })),
      voided: Schema.Boolean,
    }),
  );

  it.prop("never nets obligations across a third player", [Facts], ([facts]) => {
    const valid = facts.filter((fact) => fact.from !== fact.to);
    const between = (keep: (a: PlayerId, b: PlayerId) => boolean) => {
      const entries = [];
      const repayments = [];
      for (const [index, fact] of valid.entries()) {
        const a = players[fact.from]!;
        const b = players[fact.to]!;
        if (!keep(a, b)) continue;
        const voided = fact.voided ? { voidedAt: LATER, voidedBy: ACTOR, voidReason: "x" } : {};
        if (fact.kind === "repayment")
          repayments.push(
            repayment({
              id: entryId(index + 1),
              fromPlayerId: a,
              toPlayerId: b,
              amount: MinorUnits.make(fact.amount),
              ...voided,
            }),
          );
        else
          entries.push({
            ...play({
              id: entryId(index + 1),
              kind: fact.kind,
              amount: MinorUnits.make(fact.amount),
              counterpartyId: b,
              occurredAt: AT,
              ...voided,
            }),
            playerId: a,
          });
      }
      return pairBalances(entries, repayments);
    };
    const all = between(() => true);
    for (const a of players)
      for (const b of players) {
        if (a >= b) continue;
        const inPair = (x: PlayerId, y: PlayerId) => (x === a && y === b) || (x === b && y === a);
        // Each pair's balance depends on its own facts and nothing anyone else did.
        expect(all.filter((item) => inPair(item.debtorId, item.creditorId))).toEqual(
          between(inPair),
        );
      }
    expect(all.every((item) => item.debtorId !== item.creditorId && item.amount > 0)).toBe(true);
  });
});
