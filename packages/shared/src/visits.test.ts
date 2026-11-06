import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { MinorUnits, VisitId } from "@stacks/contracts";

import { projectVisit, visitSummary } from "./visits.ts";
import { playerResults } from "./results.ts";
import { ACTOR, BEA, LATER, entryId, play, visit } from "./testing/recording.ts";

const milestone = [
  play(),
  play({ id: entryId(2), amount: MinorUnits.make(10000) }),
  play({ id: entryId(3), kind: "cash_out", amount: MinorUnits.make(10000) }),
  play({ id: entryId(4), kind: "cash_out", amount: MinorUnits.make(25000) }),
];
const finished = { ...visit, finishedAt: LATER, revision: 1 };

describe("visitSummary", () => {
  it("keeps the result pending through rebuys and partial cash-outs until explicit finish", () => {
    for (let count = 1; count <= milestone.length; count++) {
      expect(visitSummary(visit, milestone.slice(0, count)).finalResult).toBeNull();
    }
    expect(visitSummary(visit, milestone).totals).toEqual({
      buyIn: 30000,
      cashOut: 35000,
      adjustment: 0,
    });
    expect(visitSummary(finished, milestone)).toEqual({
      visit: finished,
      totals: { buyIn: 30000, cashOut: 35000, adjustment: 0 },
      finalResult: 5000,
    });
  });

  it("distinguishes a finished even result and finishing with zero after a partial withdrawal", () => {
    const entries = [
      play(),
      play({ id: entryId(2), kind: "cash_out", amount: MinorUnits.make(20000) }),
    ];
    expect(visitSummary(visit, entries).finalResult).toBeNull();
    expect(visitSummary(finished, entries).finalResult).toBe(0);
    entries.push(play({ id: entryId(3), kind: "cash_out", amount: MinorUnits.make(0) }));
    expect(visitSummary(finished, entries).finalResult).toBe(0);
    expect(visitSummary(finished, [play(), entries[2]!]).finalResult).toBe(-20000);
  });

  it("retains correction chains while counting only live facts without reopening", () => {
    const original = { ...milestone[3]!, voidedAt: LATER, voidedBy: ACTOR, voidReason: "amount" };
    const replacement = play({
      id: entryId(5),
      kind: "cash_out",
      amount: MinorUnits.make(24000),
      replacesEntryId: original.id,
    });
    const entries = Object.freeze(
      [...milestone.slice(0, 3), original, replacement].map((entry) => Object.freeze(entry)),
    );
    const projection = projectVisit(finished, entries);
    expect(projection.summary.finalResult).toBe(4000);
    expect(projection.entries.map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
    expect(projection.entries[3]?.voidedAt).toBe(LATER);
    expect(projection.entries[4]?.replacesEntryId).toBe(original.id);
    expect(
      visitSummary({ ...finished, finishedAt: null, revision: 2 }, entries).finalResult,
    ).toBeNull();
    expect(entries[3]).toEqual(original);
  });

  it("keeps returning visits separate and finishes players independently at one table", () => {
    const returning = {
      ...visit,
      id: VisitId.make("0192e7a0-0000-7000-8000-0000000000b2"),
      startedAt: LATER,
    };
    const friend = {
      ...visit,
      id: VisitId.make("0192e7a0-0000-7000-8000-0000000000b3"),
      playerId: BEA,
    };
    const entries = [
      ...milestone,
      play({ id: entryId(5), visitId: returning.id, amount: MinorUnits.make(100) }),
      play({ id: entryId(6), visitId: friend.id, amount: MinorUnits.make(200) }),
    ];
    expect(visitSummary(finished, entries).finalResult).toBe(5000);
    expect(visitSummary(returning, entries)).toMatchObject({
      totals: { buyIn: 100 },
      finalResult: null,
    });
    expect(visitSummary(friend, entries)).toMatchObject({
      totals: { buyIn: 200 },
      finalResult: null,
    });
  });

  it("includes signed adjustments without treating them as cash-outs", () => {
    expect(
      visitSummary(finished, [
        ...milestone,
        play({ id: entryId(5), kind: "adjustment", amount: MinorUnits.make(-300) }),
      ]),
    ).toMatchObject({ totals: { adjustment: -300 }, finalResult: 4700 });
  });

  it("orders a copied history by occurrence, creation and ID", () => {
    const entries = [milestone[1]!, { ...milestone[0]!, occurredAt: LATER }];
    const before = entries.slice();
    expect(projectVisit(visit, entries).entries.map((entry) => entry.id)).toEqual([
      entryId(2),
      entryId(1),
    ]);
    expect(entries).toEqual(before);
  });

  it("rejects overflow instead of returning an imprecise money total", () => {
    expect(() =>
      visitSummary(finished, [
        play({ amount: MinorUnits.make(Number.MAX_SAFE_INTEGER) }),
        play({ id: entryId(2), amount: MinorUnits.make(1) }),
      ]),
    ).toThrow();
  });

  it("accumulates signed adjustments exactly before checking totals", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const entries = [max, 2, -max].map((amount, index) =>
      play({
        id: entryId(index + 1),
        kind: "adjustment",
        amount: MinorUnits.make(amount),
      }),
    );
    expect(visitSummary(finished, entries)).toMatchObject({
      totals: { adjustment: 2 },
      finalResult: 2,
    });
    expect(visitSummary(finished, entries.toReversed())).toEqual(visitSummary(finished, entries));
  });

  it.prop(
    "agrees with pure player results, ignores voids and remains pending until finish",
    [
      Schema.Array(
        Schema.Struct({
          kind: Schema.Literals(["buy_in", "cash_out", "adjustment"]),
          amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100000 })),
          negative: Schema.Boolean,
          voided: Schema.Boolean,
        }),
      ),
    ],
    ([records]) => {
      const entries = records.map(({ kind, amount, negative, voided }, index) =>
        play({
          id: entryId(index + 1),
          kind,
          amount: MinorUnits.make(kind === "adjustment" && negative ? -amount : amount),
          voidedAt: voided ? LATER : null,
          voidedBy: voided ? ACTOR : null,
        }),
      );
      const summary = visitSummary(finished, entries);
      const expected = playerResults(
        entries.map((entry) => ({ ...entry, playerId: visit.playerId })),
      ).get(visit.playerId);
      expect(summary.finalResult).toBe(expected?.net ?? 0);
      expect(summary.totals).toEqual({
        buyIn: expected?.buyIn ?? 0,
        cashOut: expected?.cashOut ?? 0,
        adjustment: expected?.adjustment ?? 0,
      });
      expect(visitSummary(finished, entries.toReversed())).toEqual(summary);
      expect(visitSummary(visit, entries).finalResult).toBeNull();
    },
  );
});
