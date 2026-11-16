import type { GroupId, TripId } from "@stacks/contracts";
import { ChartColumn } from "lucide-react";

import { ButtonLink } from "~/components/ui/Button";

/**
 * The group, and maybe the trip, that Stats opens on. It rides in navigation state, not the
 * address, so `/stats` stays queryless for the offline shell.
 */
export type StatsPick = { readonly groupId: GroupId; readonly tripId?: TripId };

declare module "@tanstack/react-router" {
  interface HistoryState {
    statsPick?: StatsPick;
  }
}

/** Opens Stats with this group (and trip) picked. */
export function StatsLink({
  pick,
  variant = "secondary",
  className,
}: {
  pick: StatsPick;
  variant?: "secondary" | "ghost";
  className?: string;
}) {
  return (
    <ButtonLink
      to="/stats"
      state={{ statsPick: pick }}
      variant={variant}
      {...(className ? { className } : {})}
    >
      <ChartColumn className="size-4" aria-hidden />
      Stats
    </ButtonLink>
  );
}
