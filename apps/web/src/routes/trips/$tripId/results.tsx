import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { useState } from "react";

import { Segmented } from "~/components/ui/Segmented";
import { TripStats } from "~/features/RaceStats";
import { DaysBoard, TonightBoard, TripBoard } from "~/features/TripBoard";
import { TripHeader } from "~/features/TripHeader";
import { TripLayout, TripRail } from "~/features/TripRail";
import { TripLoaded } from "~/lib/stacks";
import { TripPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/trips/$tripId/results")({ component: ResultsPage });

function ResultsPage() {
  const { tripId } = Route.useParams();
  return (
    <TripLoaded tripId={TripId.make(tripId)} skeleton={<TripPageSkeleton on="results" />}>
      {(trip, group) => (
        <>
          <TripHeader group={group} trip={trip} current="results" />
          <TripLayout rail={<TripRail group={group} trip={trip} on="results" />}>
            <Results group={group} trip={trip} />
          </TripLayout>
        </>
      )}
    </TripLoaded>
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
