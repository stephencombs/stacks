import { createFileRoute, Navigate } from "@tanstack/react-router";
import type { Group, Trip } from "@stacks/contracts";
import { resolveEntry, tripDates } from "@stacks/client-runtime/trip";

import { ButtonLink } from "~/components/ui/Button";
import { PageHeader } from "~/components/ui/Page";
import { List, RowLink, RowText } from "~/components/ui/Surface";
import { GroupsList } from "~/features/GroupsList";
import { Loaded, Prefetch, useLastTrip, useStacks } from "~/lib/stacks";
import { GroupsSkeleton, TripPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const stacks = useStacks();
  const { lastTripId } = useLastTrip();
  // Most visits land on the last trip, so wait in its shape and start loading it now.
  const skeleton = lastTripId ? <TripPageSkeleton on="sessions" /> : <GroupsSkeleton />;
  return (
    <>
      {lastTripId ? (
        <>
          <Prefetch query={stacks.trip(lastTripId)} />
          <Prefetch query={stacks.limits(lastTripId)} />
        </>
      ) : null}
      <Loaded query={stacks.groups} skeleton={skeleton}>
        {(groups) => {
          const entry = resolveEntry(groups, lastTripId);
          if (entry.kind === "trip") {
            return <Navigate to="/trips/$tripId" params={{ tripId: entry.tripId }} replace />;
          }
          if (entry.kind === "choose") {
            return <TripChooser trips={entry.trips} />;
          }
          return <GroupsList />;
        }}
      </Loaded>
    </>
  );
}

function TripChooser({
  trips,
}: {
  trips: ReadonlyArray<{ readonly group: Group; readonly trip: Trip }>;
}) {
  return (
    <>
      <PageHeader title="Choose a trip" context="More than one trip is going right now." />
      <List>
        {trips.map(({ group, trip }) => (
          <RowLink key={trip.id} to="/trips/$tripId" params={{ tripId: trip.id }}>
            <RowText title={trip.name} meta={`${group.name} · ${tripDates(trip)}`} />
          </RowLink>
        ))}
      </List>
      <ButtonLink to="/groups" variant="ghost" className="self-start">
        Your groups
      </ButtonLink>
    </>
  );
}
