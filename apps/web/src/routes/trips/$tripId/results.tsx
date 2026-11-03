import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { useState } from "react";

import { Segmented } from "~/components/ui/Segmented";
import { Skeleton } from "~/components/ui/Surface";
import { TripStats } from "~/features/RaceStats";
import { DaysBoard, TonightBoard, TripBoard } from "~/features/TripBoard";
import { TripHeader } from "~/features/TripHeader";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/results")({ component: ResultsPage });

function ResultsPage() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="h-96" />}>
      {(trip) => (
        <Loaded query={stacks.group(trip.trip.groupId)} skeleton={<Skeleton className="h-96" />}>
          {(group) => (
            <>
              <TripHeader group={group} trip={trip} current="results" />
              <Results group={group} trip={trip} />
            </>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}

const views = [
  { value: "trip", label: "Standings" },
  { value: "tonight", label: "Tonight" },
  { value: "days", label: "Days" },
  { value: "race", label: "Race" },
] as const;

function Results({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const [view, setView] = useState<(typeof views)[number]["value"]>("trip");
  return (
    <>
      <Segmented label="View" variant="quiet" options={views} value={view} onChange={setView} />
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
