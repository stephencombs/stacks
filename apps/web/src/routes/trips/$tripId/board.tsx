import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { localClock } from "@stacks/client-runtime/trip";
import { tonightBoard } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useState } from "react";

import { Skeleton } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { TripStats } from "~/features/RaceStats";
import { TonightBoard, TripBoard } from "~/features/TripBoard";
import { TripHeader } from "~/features/TripHeader";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/board")({ component: BoardPage });

function BoardPage() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="mt-4 h-96" />}>
      {(trip) => (
        <Loaded
          query={stacks.group(trip.trip.groupId)}
          skeleton={<Skeleton className="mt-4 h-96" />}
        >
          {(group) => (
            <>
              <TripHeader group={group} trip={trip} current="board" />
              <Board group={group} trip={trip} />
            </>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}

const views = [
  { key: "tonight", label: "Tonight" },
  { key: "trip", label: "Trip" },
  { key: "race", label: "Race" },
] as const;

/**
 * Tonight's board, the whole trip's standings, awards and nights, or the race for first. Opens on
 * tonight while there's anything on it.
 */
function Board({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const [view, setView] = useState<(typeof views)[number]["key"]>(() =>
    tonightBoard(
      trip.sessions.filter((s) => s.session.status === "closed"),
      trip.sessions.filter((s) => s.session.status === "live"),
      localClock,
      DateTime.nowUnsafe(),
    ).length > 0
      ? "tonight"
      : "trip",
  );
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Show"
        className="flex gap-1 self-start rounded-lg bg-sunken p-1"
      >
        {views.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={view === option.key}
            onClick={() => setView(option.key)}
            className={cn(
              "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors duration-150 pointer-coarse:h-10",
              view === option.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {view === "tonight" ? (
        <TonightBoard detail={group} trip={trip} />
      ) : view === "trip" ? (
        <TripBoard detail={group} trip={trip} />
      ) : (
        <TripStats detail={group} trip={trip} />
      )}
    </div>
  );
}
