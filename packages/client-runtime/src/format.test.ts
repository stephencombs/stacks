import { expect, it } from "@effect/vitest";

import * as DateTime from "effect/DateTime";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  StakeId,
  TripId,
  UserId,
  type StakeView,
} from "@stacks/contracts";

import { csvFilename, isFormerMember, isGuest, playedSummary, stakeLines } from "./format.ts";

it("sums up what the group has played", () => {
  expect(playedSummary(29, 8100)).toBe("The group has played 29 sessions over 135 hours.");
  expect(playedSummary(1, 60)).toBe("The group has played 1 session over 1 hour.");
  expect(playedSummary(2, 95)).toBe("The group has played 2 sessions over 1.6 hours.");
  // Imported sessions have no recorded length.
  expect(playedSummary(41, 0)).toBe("The group has played 41 sessions.");
});

it("tells guests from former members", () => {
  const guest = {
    id: PlayerId.make("0192e7a0-0000-7000-8000-000000000011"),
    displayName: "Cam",
    userId: null,
    role: null,
    claimCode: "CLAIM123",
  };
  const former = {
    id: PlayerId.make("0192e7a0-0000-7000-8000-000000000012"),
    displayName: "Kim",
    userId: UserId.make("user_kim"),
    role: null,
    claimCode: null,
  };
  expect([isGuest(guest), isFormerMember(guest)]).toEqual([true, false]);
  expect([isGuest(former), isFormerMember(former)]).toEqual([false, true]);
});

it("builds a clean CSV filename", () => {
  expect(csvFilename("Vegas Crew!")).toBe("vegas-crew-ledger.csv");
  expect(csvFilename("   ")).toBe("stacks-ledger.csv");
});

it("says how a stake stands", () => {
  const bruce = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
  const nick = PlayerId.make("0192e7a0-0000-7000-8000-000000000002");
  const names = new Map([
    [bruce, "Bruce"],
    [nick, "Nick"],
  ]);
  const at = DateTime.makeUnsafe("2026-10-21T20:00:00Z");
  const view = (fields: Partial<StakeView["stake"]>, result: number, owed: number): StakeView => ({
    stake: {
      id: StakeId.make("0192e7a0-0000-7000-8000-000000000009"),
      groupId: GroupId.make("0192e7a0-0000-7000-8000-000000000008"),
      tripId: TripId.make("0192e7a0-0000-7000-8000-000000000007"),
      lenderId: bruce,
      borrowerId: nick,
      amount: MinorUnits.make(100000),
      lenderShare: 50,
      startedAt: at,
      endedAt: null,
      note: null,
      createdBy: UserId.make("user_bruce"),
      createdAt: at,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      ...fields,
    },
    result: MinorUnits.make(result),
    owed: MinorUnits.make(owed),
  });
  const usd = CurrencyCode.make("USD");

  expect(stakeLines(view({}, 40000, 120000), names, usd)).toEqual({
    title: "Bruce backed Nick $1,000 · 50% of winnings",
    status: "Nick is up $400 · owes back $1,200",
  });
  expect(stakeLines(view({}, 0, 100000), names, usd).status).toBe(
    "Nick is even · owes back $1,000",
  );
  expect(
    stakeLines(view({ voidedAt: at, voidReason: "Wrong amount" }, 0, 0), names, usd).status,
  ).toBe("Voided: Wrong amount");
  expect(stakeLines(view({ endedAt: at }, -40000, 60000), names, usd).status).toMatch(
    /^Ended .+ · Nick was down \$400 · owes back \$600$/,
  );
});
