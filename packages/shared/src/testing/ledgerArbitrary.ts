import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { MinorUnits, PlayerId, type Entry } from "@stacks/contracts";

const PLAYERS = [
  PlayerId.make("0192e7a0-0000-7000-8000-000000000001"),
  PlayerId.make("0192e7a0-0000-7000-8000-000000000002"),
  PlayerId.make("0192e7a0-0000-7000-8000-000000000003"),
  PlayerId.make("0192e7a0-0000-7000-8000-000000000004"),
  PlayerId.make("0192e7a0-0000-7000-8000-000000000005"),
] as const;
export const [ALEX, BEA, CAL, DEE] = PLAYERS;

const VOIDED_AT = DateTime.makeUnsafe("2026-10-01T00:00:00Z");

/** A ledger entry with only the fields the ledger math reads. */
export const entry = (
  fields: Pick<Entry, "kind" | "playerId" | "amount"> &
    Partial<Pick<Entry, "counterpartyId" | "voidedAt">>,
) => ({
  counterpartyId: null,
  voidedAt: null,
  ...fields,
});

export const money = (amount: number) => MinorUnits.make(amount);

/**
 * Random ledgers over five players. Session entries pick a counterparty other than the player,
 * matching what `Entry` accepts.
 */
export const RandomLedger = Schema.Array(
  Schema.Struct({
    kind: Schema.Literals(["buy_in", "cash_out", "adjustment", "settlement"]),
    player: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4 })),
    counterpartyOffset: Schema.NullOr(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
    ),
    amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000_000 })),
    voided: Schema.Boolean,
  }),
);

export const toEntries = (ledger: typeof RandomLedger.Type) =>
  ledger.map(({ kind, player, counterpartyOffset, amount, voided }) => {
    const counterpartyId =
      kind === "adjustment"
        ? null
        : kind === "settlement"
          ? PLAYERS[(player + (counterpartyOffset ?? 1)) % 5]!
          : counterpartyOffset === null
            ? null
            : PLAYERS[(player + counterpartyOffset) % 5]!;
    return entry({
      kind,
      playerId: PLAYERS[player]!,
      counterpartyId,
      amount: money(kind === "adjustment" && amount % 2 === 0 ? -amount : amount),
      voidedAt: voided ? VOIDED_AT : null,
    });
  });
