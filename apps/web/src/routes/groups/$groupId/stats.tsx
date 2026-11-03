import { createFileRoute, Navigate } from "@tanstack/react-router";
import { GroupId } from "@stacks/contracts";
import { tripInScope } from "@stacks/client-runtime/trip";

import { Loaded, useLastTrip, useStacks } from "~/lib/stacks";
import { TripPageSkeleton } from "~/features/PageSkeletons";

/** The group's old stats page: now the Board's All time, seen from the trip in scope. */
export const Route = createFileRoute("/groups/$groupId/stats")({ component: StatsRedirect });

function StatsRedirect() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  const { lastTripId } = useLastTrip();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<TripPageSkeleton on="board" scope="all" />}
    >
      {(detail) => {
        const trip = tripInScope(detail.trips, lastTripId);
        return trip ? (
          <Navigate
            to="/trips/$tripId/board"
            params={{ tripId: trip.id }}
            search={{ scope: "all" }}
            replace
          />
        ) : (
          <Navigate to="/groups/$groupId" params={{ groupId }} replace />
        );
      }}
    </Loaded>
  );
}
