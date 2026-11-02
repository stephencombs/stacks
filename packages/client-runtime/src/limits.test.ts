import { expect, it } from "@effect/vitest";
import { EntryId, MinorUnits, PlayerId, SessionId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { reconcileLimitSessions } from "./limits.ts";

const player = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
const first = SessionId.make("0192e7a0-0000-7000-8000-000000000002");
const second = SessionId.make("0192e7a0-0000-7000-8000-000000000003");
const id = (n: number) => EntryId.make(`0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`);
const pending = (
  sessionId: SessionId,
  n: number,
  amount: number,
  kind: "buy_in" | "cash_out" = "buy_in",
  replacesEntryId: EntryId | null = null,
  failed: string | null = null,
) => ({
  sessionId,
  failed,
  entry: {
    id: id(n),
    playerId: player,
    amount: MinorUnits.make(amount),
    kind,
    replacesEntryId,
    counterpartyId: null,
    note: null,
  },
});

it("reconciles other sessions, corrections, acknowledgements and refusals", () => {
  const sessions = [first, second].map((sessionId) => ({
    session: { id: sessionId, status: "live" as const },
    playerIds: [player],
    results: [
      {
        playerId: player,
        net: MinorUnits.make(-100),
        buyIn: MinorUnits.make(100),
        cashOut: MinorUnits.make(0),
        adjustment: MinorUnits.make(0),
      },
    ],
    playing: [player],
    ledgerEntryIds: [id(sessionId === first ? 10 : 11)],
    myLedgerEntries: [
      {
        id: id(sessionId === first ? 10 : 11),
        kind: "buy_in" as const,
        amount: MinorUnits.make(100),
        voidedAt: null,
      },
    ],
  }));
  const result = reconcileLimitSessions(
    sessions,
    player,
    [
      pending(first, 1, 150, "buy_in", id(10)),
      pending(second, 2, 40, "cash_out"),
      pending(second, 3, 999, "buy_in", null, "refused"),
      pending(first, 10, 100),
    ],
    [pending(second, 2, 40, "cash_out")],
  );
  expect(result?.map((session) => session.results[0]?.net)).toEqual([-150, -60]);
  expect(result?.[1]?.playing).toEqual([]);
  const { myLedgerEntries: _missing, ...cached } = sessions[0]!;
  expect(reconcileLimitSessions([cached], player, [], [])).toBeNull();
  const voided = [
    {
      ...sessions[0]!,
      results: [{ ...sessions[0]!.results[0]!, net: MinorUnits.make(0) }],
      myLedgerEntries: [
        {
          ...sessions[0]!.myLedgerEntries[0]!,
          voidedAt: DateTime.makeUnsafe("2026-01-01T00:00:00Z"),
        },
      ],
    },
  ];
  expect(
    reconcileLimitSessions(voided, player, [pending(first, 4, 50, "cash_out", id(10))], [])?.[0]
      ?.results[0]?.net,
  ).toBe(50);
});
