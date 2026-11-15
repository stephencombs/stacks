// Preview only: ?sessions=sample fills this browser's own ledger once, for screens like Stats.
import { VenueId, type Game } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";

import { recordingStore } from "~/lib/recording";

const venues = [1, 2, 3, 4].map((n) => VenueId.make(`0192e7a0-0000-7000-8000-0000000007${n}0`));
const games: ReadonlyArray<Game> = ["blackjack", "craps", "baccarat", "blackjack", "roulette"];
const DAY = 86_400_000;

export const seedSessions = async () => {
  await recordingStore.ready;
  if ((recordingStore.getSnapshot().state?.visits.length ?? 0) > 0) return;
  // The same made-up history every time: wins and losses over three years, and one live session.
  let seed = 7;
  const random = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  const save = (input: Parameters<typeof recordingStore.prepare>[0]) =>
    recordingStore.execute(recordingStore.prepare(input));
  let at = Date.UTC(2024, 0, 20, 2);
  for (let i = 0; i < 40; i++) {
    at += Math.round((8 + random() * 22) * DAY);
    const buyIn = Math.round(2 + random() * 4) * 10_000;
    const cashOut = Math.max(0, buyIn + Math.round((random() - 0.44) * 8) * 5_000);
    const startedAt = DateTime.makeUnsafe(at);
    await save({
      type: "record_completed",
      buyIn,
      cashOut,
      startedAt,
      finishedAt: DateTime.makeUnsafe(at + Math.round(4 + random() * 14) * 15 * 60_000),
      game: games[i % games.length]!,
      venueId: venues[Math.floor(random() * venues.length)]!,
    });
  }
  await save({ type: "start", buyIn: 30_000, game: "blackjack", venueId: venues[2]! });
};
