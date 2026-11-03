import { MinorUnits, type PlayerId, type SessionSummary } from "@stacks/contracts";
import type { Pending } from "./outbox.ts";

type Input = Pick<
  SessionSummary,
  "session" | "playerIds" | "results" | "playing" | "ledgerEntryIds" | "myLedgerEntries"
>;
type MinimalInput = Omit<Input, "session"> & {
  readonly session: Pick<Input["session"], "id" | "status">;
};

export const reconcileLimitSessions = <S extends MinimalInput>(
  sessions: readonly S[],
  playerId: PlayerId,
  pending: readonly Pending[],
  sent: readonly Pending[],
): S[] | null => {
  if (sessions.some((session) => !session.ledgerEntryIds || !session.myLedgerEntries)) return null;
  return sessions.map((session) => {
    const known = new Set(session.ledgerEntryIds);
    const entries = new Map(
      session
        .myLedgerEntries!.filter((entry) => entry.voidedAt === null)
        .map((entry) => [entry.id, entry]),
    );
    const value = (entry: { kind: string; amount: number }) =>
      entry.kind === "buy_in" ? -entry.amount : entry.amount;
    const before = Array.from(entries.values()).reduce((sum, entry) => sum + value(entry), 0);
    for (const item of [...sent, ...pending]) {
      if (item.sessionId !== session.session.id || item.failed !== null || known.has(item.entry.id))
        continue;
      known.add(item.entry.id);
      if (item.entry.replacesEntryId) entries.delete(item.entry.replacesEntryId);
      if (item.entry.playerId === playerId)
        entries.set(item.entry.id, { ...item.entry, voidedAt: null });
    }
    const after = Array.from(entries.values()).reduce((sum, entry) => sum + value(entry), 0);
    const net =
      (session.results.find((result) => result.playerId === playerId)?.net ?? 0) + after - before;
    const playing = session.playing.filter((id) => id !== playerId);
    if (
      session.session.status === "live" &&
      session.playerIds.includes(playerId) &&
      !Array.from(entries.values()).some((entry) => entry.kind === "cash_out")
    )
      playing.push(playerId);
    const previous = session.results.find((result) => result.playerId === playerId);
    return {
      ...session,
      playing,
      results: [
        ...session.results.filter((result) => result.playerId !== playerId),
        {
          playerId,
          buyIn: MinorUnits.make(0),
          cashOut: MinorUnits.make(0),
          adjustment: MinorUnits.make(0),
          ...previous,
          net: MinorUnits.make(net),
        },
      ],
    };
  });
};
