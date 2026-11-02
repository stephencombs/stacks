import { createFileRoute } from "@tanstack/react-router";
import { GroupId, type GroupDetail } from "@stacks/contracts";
import { Plus } from "lucide-react";

import { ButtonLink } from "~/components/ui/Button";
import { Skeleton } from "~/components/ui/Surface";
import { GroupHeader } from "~/features/GroupHeader";
import { StartTripButton, TripsSection } from "~/features/Trips";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/groups/$groupId/")({ component: GroupHome });

function GroupHome() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded
      query={stacks.group(GroupId.make(groupId))}
      skeleton={<Skeleton className="mt-4 h-96" />}
    >
      {(detail) => <GroupHomeView detail={detail} />}
    </Loaded>
  );
}

function GroupHomeView({ detail }: { detail: GroupDetail }) {
  // Trips come newest first, so the first one still going is where tonight's sessions go.
  const going = detail.trips.find((trip) => trip.endedAt === null);
  const action = going ? (
    <ButtonLink to="/trips/$tripId/sessions/new" params={{ tripId: going.id }} variant="primary">
      <Plus className="size-4" aria-hidden />
      Start a session
    </ButtonLink>
  ) : detail.trips.length > 0 ? (
    <StartTripButton detail={detail} />
  ) : null;

  return (
    <>
      <GroupHeader detail={detail} current="home" action={action} />
      <TripsSection detail={detail} />
      {going ? (
        <div>
          <StartTripButton detail={detail} variant="secondary" />
        </div>
      ) : null}
    </>
  );
}
