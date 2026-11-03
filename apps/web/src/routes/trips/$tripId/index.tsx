import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { Plus } from "lucide-react";

import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, Section } from "~/components/ui/Page";
import { LiveSessionCard, SessionList } from "~/features/SessionList";
import { PersonalLimits } from "~/features/PersonalLimits";
import { TripHero } from "~/features/TripHero";
import { TripHeader } from "~/features/TripHeader";
import { SessionTable, TripLayout, TripRail } from "~/features/TripRail";
import { TripLoaded } from "~/lib/stacks";
import { TripPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/trips/$tripId/")({ component: TripPage });

function TripPage() {
  const { tripId } = Route.useParams();
  return (
    <TripLoaded tripId={TripId.make(tripId)} skeleton={<TripPageSkeleton on="sessions" />}>
      {(trip, group) => <TripView trip={trip} group={group} />}
    </TripLoaded>
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
      <TripLayout rail={<TripRail group={group} trip={trip} on="sessions" />}>
        <PersonalLimits group={group} trip={trip} settings />
        <TripHero
          currency={group.group.currency}
          me={group.myPlayerId}
          sessions={trip.sessions.filter((s) => s.session.status === "closed")}
        />
        {/* On a wide screen your live table sits in the rail instead. */}
        {mine ? (
          <div className="lg:hidden">
            <LiveSessionCard summary={mine} detail={group} />
          </div>
        ) : null}
        {live.length > 0 ? (
          <Section title={mine ? "Other live sessions" : "Live sessions"}>
            <SessionList sessions={live} detail={group} />
          </Section>
        ) : null}
        {closed.length > 0 ? (
          <Section
            title="Past sessions"
            aside={`${closed.length} ${closed.length === 1 ? "session" : "sessions"}`}
          >
            <div className="lg:hidden">
              <SessionList sessions={closed} detail={group} />
            </div>
            <div className="hidden lg:block">
              <SessionTable sessions={closed} group={group} />
            </div>
          </Section>
        ) : !mine && live.length === 0 ? (
          <EmptyState title="No sessions on this trip yet">
            {trip.trip.endedAt === null
              ? "Start one when you sit down to play."
              : "This trip ended before anyone played."}
          </EmptyState>
        ) : null}
      </TripLayout>
    </>
  );
}
