import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { Plus } from "lucide-react";

import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, SectionHeading, Skeleton } from "~/components/ui/Surface";
import { SessionList } from "~/features/SessionList";
import { TripBoard } from "~/features/TripBoard";
import { TripHeader } from "~/features/TripHeader";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/")({ component: TripPage });

function TripPage() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="mt-4 h-96" />}>
      {(trip) => (
        <Loaded
          query={stacks.group(trip.trip.groupId)}
          skeleton={<Skeleton className="mt-4 h-96" />}
        >
          {(group) => <TripView trip={trip} group={group} />}
        </Loaded>
      )}
    </Loaded>
  );
}

function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const closed = trip.sessions.filter((s) => s.session.status === "closed").toReversed();
  const startSession =
    trip.trip.endedAt === null ? (
      <ButtonLink
        to="/trips/$tripId/sessions/new"
        params={{ tripId: trip.trip.id }}
        variant="primary"
      >
        <Plus className="size-4" aria-hidden />
        Start a session
      </ButtonLink>
    ) : null;

  return (
    <>
      <TripHeader group={group} trip={trip} current="board" action={startSession} />
      <TripBoard detail={group} trip={trip} />

      <section className="flex flex-col gap-2">
        <SectionHeading>Sessions</SectionHeading>
        {trip.sessions.length === 0 ? (
          <EmptyState title="No sessions yet" action={startSession}>
            Start one when you sit down to play. Everyone's buy-ins and cash-outs go in it, and the
            board fills in as sessions close.
          </EmptyState>
        ) : closed.length > 0 ? (
          <SessionList sessions={closed} detail={group} />
        ) : (
          <p className="text-sm text-muted">
            Finished sessions show up here. Live ones are on the board.
          </p>
        )}
      </section>
    </>
  );
}
