import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import { chipOf, closedPlays, localClock } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";
import { Glow, Surface } from "~/components/ui/Surface";
import { Chip } from "./Chip";

/**
 * Sessions on a screen with room beside it: the trip's sessions on the left, and on the right who's
 * winning and where you stand, a glance before going to Stats. Below `xl` the rail
 * drops away and the page is one column.
 */
export function TripLayout({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
      <aside
        aria-label="The rest of this trip"
        className="sticky top-10 hidden flex-col gap-6 xl:flex"
      >
        {rail}
      </aside>
    </div>
  );
}

/** What the rail holds: the standings and your balance. */
export function TripRail({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  return (
    <>
      <RailStandings group={group} trip={trip} />
      <RailBalance group={group} trip={trip} />
    </>
  );
}

function RailStandings({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const closed = closedPlays(trip);
  const standings = tripStandings(closed, localClock).toSorted((a, b) => a.rank - b.rank);
  const names = playerNames(group);
  if (standings.length === 0) return null;
  return (
    <Surface className="overflow-hidden">
      <div className="flex min-h-12 items-center justify-between pr-2 pl-4">
        <h2 className="font-semibold">Standings</h2>
        <Link
          to="/stats"
          state={{ statsPick: { groupId: group.group.id, tripId: trip.trip.id } }}
          className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm text-muted transition-colors duration-150 hover:text-ink"
        >
          Stats
        </Link>
      </div>
      <ol className="pb-1">
        {standings.map((s) => {
          const name = names.get(s.playerId) ?? "Player";
          const you = s.playerId === group.myPlayerId;
          return (
            <li
              key={s.playerId}
              className={cn(
                "flex min-h-12 items-center gap-3 px-4",
                you && "shadow-[inset_3px_0_0_var(--color-ink)]",
              )}
            >
              <span className="w-4 shrink-0 text-center text-sm text-muted tabular-nums">
                {s.rank}
              </span>
              <Chip chip={chipOf(group, s.playerId)} name={name} size={24} />
              <span className="min-w-0 flex-1 truncate font-medium" title={name}>
                {name}
                {you ? <span className="font-normal text-muted"> (you)</span> : null}
              </span>
              <Money
                amount={s.net}
                currency={group.group.currency}
                tone="result"
                className="font-semibold"
              />
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}

function RailBalance({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const me = group.myPlayerId;
  const balance = trip.balances.find((b) => b.playerId === me)?.amount ?? 0;
  const head = {
    label: balance > 0 ? "You're owed" : balance < 0 ? "You owe" : "You're square",
    tone: balance > 0 ? ("win" as const) : balance < 0 ? ("loss" as const) : ("ink" as const),
  };
  return (
    <Surface className="relative overflow-hidden">
      <Glow tone={head.tone} />
      <div className="relative flex flex-col p-4">
        <h2 className="text-sm font-medium text-muted">{head.label}</h2>
        <Money
          amount={Math.abs(balance)}
          currency={group.group.currency}
          className={cn(
            "mt-2 font-display text-4xl leading-none tracking-[-0.01em]",
            balance > 0 ? "text-win" : balance < 0 ? "text-loss" : "text-muted",
          )}
        />
      </div>
    </Surface>
  );
}
