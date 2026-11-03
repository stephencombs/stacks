import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { Plus } from "lucide-react";

import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, Section } from "~/components/ui/Page";
import { Skeleton } from "~/components/ui/Surface";
import { SessionList } from "~/features/SessionList";
import { TripHeader } from "~/features/TripHeader";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/trips/$tripId/")({ component: TripPage });

function TripPage() {
  const { tripId } = Route.useParams();
  const stacks = useStacks();
  return (
    <Loaded query={stacks.trip(TripId.make(tripId))} skeleton={<Skeleton className="h-96" />}>
      {(trip) => (
        <Loaded query={stacks.group(trip.trip.groupId)} skeleton={<Skeleton className="h-96" />}>
          {(group) => <TripView trip={trip} group={group} />}
        </Loaded>
      )}
    </Loaded>
  );
}

function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  const live = trip.sessions.filter((s) => s.session.status === "live" && s !== mine);
  const closed = trip.sessions.filter((s) => s.session.status === "closed").toReversed();
  const startSession =
    trip.trip.endedAt === null ? (
      <ButtonLink
        to="/trips/$tripId/sessions/new"
        params={{ tripId: trip.trip.id }}
        variant={mine ? "secondary" : "primary"}
      >
        <Plus className="size-4" aria-hidden />
        Start a session
      </ButtonLink>
    ) : null;

  return (
    <>
      <TripHeader group={group} trip={trip} current="sessions" action={startSession} />
      {mine ? (
        <Section title="Your live session">
          <SessionList sessions={[mine]} detail={group} />
        </Section>
      ) : null}
      {live.length > 0 ? (
        <Section title={mine ? "Other live sessions" : "Live sessions"}>
          <SessionList sessions={live} detail={group} />
        </Section>
      ) : null}
      {closed.length > 0 ? (
        <Section title="Past sessions">
          <SessionList sessions={closed} detail={group} />
        </Section>
      ) : !mine && live.length === 0 ? (
        <EmptyState title="No sessions on this trip yet">
          {trip.trip.endedAt === null
            ? "Start one when you sit down to play."
            : "This trip ended before anyone played."}
        </EmptyState>
      ) : null}
    </>
  );
}
