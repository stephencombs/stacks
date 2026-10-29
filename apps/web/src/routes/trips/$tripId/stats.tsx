import { createFileRoute } from "@tanstack/react-router";
import { TripId } from "@stacks/contracts";

import { Skeleton } from "~/components/ui/Surface";
import { TripHeader } from "~/features/TripHeader";
import { TripStats } from "~/features/TripStats";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/stats")({ component: TripStatsPage });

function TripStatsPage() {
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
              <TripHeader group={group} trip={trip} current="stats" />
              <TripStats detail={group} trip={trip} />
            </>
          )}
        </Loaded>
      )}
    </Loaded>
  );
}
