import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TripId, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import { localClock, nightLabel, tripPlays } from "@stacks/client-runtime/trip";
import { tripNights } from "@stacks/shared/trips";
import { Plus } from "lucide-react";
import { useState } from "react";

import { ActionBar } from "~/components/ui/ActionBar";
import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { EmptyState, Section } from "~/components/ui/Page";
import { StartDialog } from "~/features/RecordingForms";
import { SessionList } from "~/features/SessionList";
import { TripHero } from "~/features/TripHero";
import { TripHeader } from "~/features/TripHeader";
import { TripLoaded } from "~/lib/stacks";
import { TripPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/trips/$tripId/")({ component: TripPage });

function TripPage() {
  const { tripId } = Route.useParams();
  return (
    <TripLoaded tripId={TripId.make(tripId)} skeleton={<TripPageSkeleton />}>
      {(trip, group) => <TripView trip={trip} group={group} />}
    </TripLoaded>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The trip: how it's going for you, who's at a table now, then everything played, day by day.
 * Your own live play is the LiveBar's, so it's left out of the live list.
 */
function TripView({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const plays = tripPlays(trip);
  const myLive = plays.some((s) => s.live && s.playing.includes(group.myPlayerId));
  const live = plays.filter((s) => s.live && !s.playing.includes(group.myPlayerId));
  const closed = plays.filter((s) => !s.live);
  const nights = tripNights(closed, localClock).toReversed();
  const startSession =
    trip.trip.endedAt === null && group.group.currency === RECORDING_CURRENCY ? (
      <Button
        onClick={() => setStarting(true)}
        variant="primary"
        className="w-full lg:w-auto"
        size="lg"
      >
        <Plus className="size-4" aria-hidden />
        Start a session
      </Button>
    ) : null;

  return (
    <>
      {starting ? (
        <StartDialog
          initialTripId={trip.trip.id}
          onClose={() => setStarting(false)}
          onStarted={(visitId) => {
            setStarting(false);
            void navigate({ to: "/play/$visitId", params: { visitId } });
          }}
        />
      ) : null}
      <TripHeader
        group={group}
        trip={trip}
        action={<div className="hidden lg:block">{startSession}</div>}
      />
      <TripHero currency={group.group.currency} me={group.myPlayerId} sessions={closed} />
      {live.length > 0 ? (
        <Section title="Live now">
          <SessionList sessions={live} detail={group} />
        </Section>
      ) : null}
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
      {closed.length === 0 && live.length === 0 ? (
        myLive ? (
          <EmptyState title="You're playing now">
            Results appear here once a table finishes.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing finished on this trip yet">
            {trip.trip.endedAt === null
              ? "Start one when you sit down to play."
              : "This trip ended before anyone played."}
          </EmptyState>
        )
      ) : null}
      {startSession ? <ActionBar className="lg:hidden">{startSession}</ActionBar> : null}
    </>
  );
}
