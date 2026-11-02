import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";

import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, Section } from "~/components/ui/Page";
import { Skeleton } from "~/components/ui/Surface";
import { SessionList } from "~/features/SessionList";
import { SessionView } from "~/features/SessionView";
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

/** Your live table if you're seated at one; otherwise a way to start one and what's been played. */
function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const stacks = useStacks();
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  // The table you just closed stays on screen with its results, until you start the next one.
  const [kept, setKept] = useState(mine?.session.id ?? null);
  if (mine && mine.session.id !== kept) setKept(mine.session.id);
  const shown = trip.sessions.find((s) => s.session.id === kept);
  const live = trip.sessions.filter((s) => s.session.status === "live" && s !== mine);
  const closed = trip.sessions.filter((s) => s.session.status === "closed").toReversed();
  const startSession =
    trip.trip.endedAt === null && !mine ? (
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
      <TripHeader group={group} trip={trip} current="table" action={startSession} />
      {shown ? (
        <Loaded query={stacks.session(shown.session.id)} skeleton={<Skeleton className="h-96" />}>
          {(session) => <SessionView session={session} group={group} inTrip />}
        </Loaded>
      ) : null}
      {live.length > 0 ? (
        <Section title={mine ? "Also live" : "Live now"}>
          <SessionList sessions={live} detail={group} />
        </Section>
      ) : null}
      {mine ? null : closed.length > 0 ? (
        <Section title="Sessions">
          <SessionList sessions={closed} detail={group} />
        </Section>
      ) : live.length > 0 ? null : (
        <EmptyState title="No sessions yet">
          {trip.trip.endedAt === null
            ? "Start one when you sit down to play."
            : "This trip ended before anyone played."}
        </EmptyState>
      )}
    </>
  );
}
