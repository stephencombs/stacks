import { CurrencyCode, MinorUnits, PlayerId, SessionId, VenueId } from "@stacks/contracts";
import type { TripSession } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";

const id = (n: number) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const player = (n: number) => PlayerId.make(id(100 + n));

/**
 * A made-up weekend for the signed-out screens to show the app with: four friends, three
 * sessions, and "you" climbing back from a bad first night.
 */
export const sampleTrip = {
  currency: CurrencyCode.make("USD"),
  me: player(1),
  sessions: [
    { day: 30, hour: 20, nets: [-12500, 7000, 2000, -19000] },
    { day: 30, hour: 23, nets: [6000, 0, -10000, -4500] },
    { day: 31, hour: 21, nets: [34000, 11000, -13000, -6000] },
  ].map(({ day, hour, nets }, i): TripSession => ({
    session: {
      id: SessionId.make(id(200 + i)),
      startedAt: DateTime.makeUnsafe(Date.UTC(2026, 9, day, hour)),
    },
    venue: { id: VenueId.make(id(300 + i)) },
    results: nets.flatMap((net, p) =>
      net === 0
        ? []
        : [{ playerId: player(p + 1), net: MinorUnits.make(net), buyIn: MinorUnits.make(0) }],
    ),
  })),
};
