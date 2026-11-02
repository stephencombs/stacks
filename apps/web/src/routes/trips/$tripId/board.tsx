import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { localClock } from "@stacks/client-runtime/trip";
import { tonightBoard } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useState } from "react";

import { Segmented } from "~/components/ui/Segmented";
import { Skeleton } from "~/components/ui/Surface";
import { TripStats } from "~/features/RaceStats";
import { DaysBoard, TonightBoard, TripBoard } from "~/features/TripBoard";
import { TripHeader } from "~/features/TripHeader";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/board")({ component: BoardPage });

function BoardPage() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="h-96" />}>
      {(trip) => (
        <Loaded query={stacks.group(trip.trip.groupId)} skeleton={<Skeleton className="h-96" />}>
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
  { value: "tonight", label: "Tonight" },
  { value: "trip", label: "Trip" },
  { value: "days", label: "Days" },
  { value: "race", label: "Race" },
] as const;

/**
 * Tonight's board, the whole trip's standings, awards and numbers, its nights one by one, or the
 * race for first. Opens on tonight while there's anything on it.
 */
function Board({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const [view, setView] = useState<(typeof views)[number]["value"]>(() =>
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
    <>
      <Segmented label="Show" options={views} value={view} onChange={setView} />
      {view === "tonight" ? (
        <TonightBoard detail={group} trip={trip} />
      ) : view === "trip" ? (
        <TripBoard detail={group} trip={trip} />
      ) : view === "days" ? (
        <DaysBoard detail={group} trip={trip} />
      ) : (
        <TripStats detail={group} trip={trip} />
      )}
    </>
  );
}
