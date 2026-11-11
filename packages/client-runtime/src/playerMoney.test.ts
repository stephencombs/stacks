import { describe, expect, it } from "@effect/vitest";
import {
  ActorId,
  EntryId,
  MinorUnits,
  PlayerId,
  TableId,
  VisitId,
  type PairHistory,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { pairHistoryRows, pairStanding } from "./playerMoney.ts";

const ME = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
const BEA = PlayerId.make("0192e7a0-0000-7000-8000-000000000002");
const MY_ACTOR = ActorId.make("0192e7a0-0000-7000-8000-0000000000a1");
const BEA_ACTOR = ActorId.make("0192e7a0-0000-7000-8000-0000000000a2");
const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 7, 20, minute));
const id = (n: number) => EntryId.make(`0192e7a0-0000-7000-8000-${n.toString().padStart(12, "0")}`);
const audit = (minute: number, createdBy = MY_ACTOR) => ({
  createdBy,
  createdAt: at(minute),
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  replacesEntryId: null,
});
const pair = { playerId: ME, counterparty: { id: BEA, displayName: "Bea" } };

describe("pairStanding", () => {
  it("words the balance from the viewer's side", () => {
    expect(pairStanding({ ...pair, balance: null })).toEqual({
      direction: "square",
      amount: null,
      text: "Square",
    });
    expect(
      pairStanding({
        ...pair,
        balance: { debtorId: BEA, creditorId: ME, amount: MinorUnits.make(500) },
      }),
    ).toMatchObject({ direction: "owed", text: "Bea owes you" });
    expect(
      pairStanding({
        ...pair,
        balance: { debtorId: ME, creditorId: BEA, amount: MinorUnits.make(500) },
      }),
    ).toMatchObject({ direction: "owe", text: "You owe Bea" });
  });
});

describe("pairHistoryRows", () => {
  it("lists play and payments newest first, with voids, corrections and who made them", () => {
    const history: PairHistory = {
      pair: { ...pair, balance: null },
      revision: 2,
      play: [
        {
          playerId: ME,
          tableId: TableId.make("0192e7a0-0000-7000-8000-0000000000c1"),
          entry: {
            id: id(1),
            visitId: VisitId.make("0192e7a0-0000-7000-8000-0000000000d1"),
            kind: "buy_in",
            counterpartyId: BEA,
            amount: MinorUnits.make(10000),
            currency: "USD",
            occurredAt: at(0),
            note: null,
            ...audit(0),
          },
        },
      ],
      repayments: [
        {
          id: id(2),
          fromPlayerId: ME,
          toPlayerId: BEA,
          amount: MinorUnits.make(5000),
          currency: "USD",
          occurredAt: at(10),
          note: null,
          recordedFromTripId: null,
          ...audit(10),
          voidedAt: at(20),
          voidedBy: BEA_ACTOR,
          voidReason: "It was $30",
        },
        {
          id: id(3),
          fromPlayerId: ME,
          toPlayerId: BEA,
          amount: MinorUnits.make(3000),
          currency: "USD",
          occurredAt: at(10),
          note: null,
          recordedFromTripId: null,
          ...audit(20, BEA_ACTOR),
          replacesEntryId: id(2),
        },
      ],
      actors: [
        { actorId: MY_ACTOR, displayName: "Alex" },
        { actorId: BEA_ACTOR, displayName: "Bea" },
      ],
    };
    expect(
      pairHistoryRows(history, MY_ACTOR).map((row) => [
        row.text,
        row.amount,
        row.direction,
        row.recordedBy,
        row.correction,
        row.voided,
      ]),
    ).toEqual([
      ["You paid Bea", 3000, "owed", "Bea", true, null],
      ["You paid Bea", 5000, "owed", "You", false, { by: "Bea", reason: "It was $30" }],
      ["Bea covered your buy-in", 10000, "owe", "You", false, null],
    ]);
  });
});
