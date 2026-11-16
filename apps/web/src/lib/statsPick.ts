import type { GroupId, TripId } from "@stacks/contracts";

/**
 * The group, and maybe trip, Stats opens on. It travels in navigation state rather than the
 * address, which stays `/stats` so the offline shell serves it.
 */
export type StatsPick = { readonly groupId?: GroupId; readonly tripId?: TripId };

declare module "@tanstack/react-router" {
  interface HistoryState {
    statsPick?: StatsPick;
  }
}
