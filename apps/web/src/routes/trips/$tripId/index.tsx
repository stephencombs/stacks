import { createFileRoute } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { localClock, nightLabel } from "@stacks/client-runtime/trip";
import { tripNights } from "@stacks/shared/trips";
import { Plus } from "lucide-react";

import { ActionBar } from "~/components/ui/ActionBar";
import { Money } from "~/components/Money";
import { ButtonLink } from "~/components/ui/Button";
import { EmptyState, Section } from "~/components/ui/Page";
import { LiveSessionCard, SessionList } from "~/features/SessionList";
import { LimitNotices } from "~/features/PersonalLimits";
import { TripHero } from "~/features/TripHero";
import { TripHeader } from "~/features/TripHeader";
import { TripLayout, TripRail } from "~/features/TripRail";
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Sessions: your live table first, then the trip card, then everything played, night by night. */
function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  const live = trip.sessions.filter((s) => s.session.status === "live" && s !== mine);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const nights = tripNights(closed, localClock).toReversed();
  const startSession =
    trip.trip.endedAt === null ? (
      <ButtonLink
        to="/trips/$tripId/sessions/new"
        params={{ tripId: trip.trip.id }}
        variant={mine ? "secondary" : "primary"}
        className="w-full lg:w-auto"
        size="lg"
      >
        <Plus className="size-4" aria-hidden />
        Start a session
      </ButtonLink>
    ) : null;

  return (
    <>
      <TripHeader
        group={group}
        trip={trip}
        place="sessions"
        action={<div className="hidden lg:block">{startSession}</div>}
      />
      <TripLayout rail={<TripRail group={group} trip={trip} />}>
        <LimitNotices group={group} trip={trip} />
        {mine ? <LiveSessionCard summary={mine} detail={group} /> : null}
        {live.length > 0 ? (
          <Section title={mine ? "Other live sessions" : "Live sessions"}>
            <SessionList sessions={live} detail={group} />
          </Section>
        ) : null}
        <TripHero currency={group.group.currency} me={group.myPlayerId} sessions={closed} />
        {nights.map((night) => {
          const played = night.sessions.flatMap((s) =>
            s.results.filter((r) => r.playerId === group.myPlayerId),
          );
          return (
            <Section
              key={night.key}
              title={nightLabel(night)}
              aside={
                played.length === 0 ? (
                  plural(night.sessions.length, "session")
                ) : (
                  <>
                    You{" "}
                    <Money
                      amount={played.reduce((sum, r) => sum + r.net, 0)}
                      currency={group.group.currency}
                      tone="result"
                      className="font-medium"
                    />
                  </>
                )
              }
            >
              <SessionList sessions={night.sessions.toReversed()} detail={group} />
            </Section>
          );
        })}
        {closed.length === 0 && !mine && live.length === 0 ? (
          <EmptyState title="No sessions on this trip yet">
            {trip.trip.endedAt === null
              ? "Start one when you sit down to play."
              : "This trip ended before anyone played."}
          </EmptyState>
        ) : null}
      </TripLayout>
      {startSession ? (
        <ActionBar className="lg:hidden">
          {mine ? (
            <ButtonLink
              to="/sessions/$sessionId"
              params={{ sessionId: mine.session.id }}
              variant="primary"
              size="lg"
              className="w-full"
            >
              Back to your table
            </ButtonLink>
          ) : null}
          {startSession}
        </ActionBar>
      ) : null}
    </>
  );
}
