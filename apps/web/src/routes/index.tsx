import { createFileRoute, Navigate } from "@tanstack/react-router";

import { Skeleton } from "~/components/ui/Surface";
import { GroupsList } from "~/features/GroupsList";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/")({ component: Home });

/** Where the app opens: the trip that's going, or your groups when none is. */
function Home() {
  const stacks = useStacks();
  return (
    <Loaded query={stacks.groups} skeleton={<Skeleton className="h-40" />}>
      {(groups) => {
        const current = groups.find((item) => item.currentTripId)?.currentTripId;
        return current ? (
          <Navigate to="/trips/$tripId" params={{ tripId: current }} replace />
        ) : (
          <GroupsList />
        );
      }}
    </Loaded>
  );
}
