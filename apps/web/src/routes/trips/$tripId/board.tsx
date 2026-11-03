import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { TripId, type GroupDetail, type GroupStats } from "@stacks/contracts";
import { gameNames, playedSummary } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";

import { EmptyState, Note } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { Breakdown, byNet } from "~/features/Breakdown";
import { RaceStats } from "~/features/RaceStats";
import { TripBoard } from "~/features/TripBoard";
import { TripHeader } from "~/features/TripHeader";
import { TripHero } from "~/features/TripHero";
import { Loaded, Prefetch, TripLoaded, useStacks } from "~/lib/stacks";
import { TripPageSkeleton } from "~/features/PageSkeletons";

type Scope = "trip" | "all";

export const Route = createFileRoute("/trips/$tripId/board")({
  component: BoardPage,
  // This trip is the board's default; All time is the same page over every trip in the group.
  validateSearch: (search): { scope?: "all" } => (search.scope === "all" ? { scope: "all" } : {}),
});

const scopes = [
  { value: "trip", label: "This trip" },
  { value: "all", label: "All time" },
] as const;

function BoardPage() {
  const { tripId } = Route.useParams();
  const scope: Scope = Route.useSearch().scope ?? "trip";
  const navigate = useNavigate({ from: Route.fullPath });
  const stacks = useStacks();
  const skeleton = <TripPageSkeleton on="board" scope={scope} />;
  return (
    <TripLoaded tripId={TripId.make(tripId)} skeleton={skeleton}>
      {(trip, group) => {
        const header = (
          <TripHeader group={group} trip={trip} place="board">
            <Segmented
              label="Board scope"
              options={scopes}
              value={scope}
              onChange={(next) =>
                void navigate({ search: next === "all" ? { scope: "all" } : {}, replace: true })
              }
            />
          </TripHeader>
        );
        return scope === "trip" ? (
          <>
            {/* All time is a tap away, so the group's stats start loading with the trip's board. */}
            <Prefetch query={stacks.stats(group.group.id)} />
            {header}
            <TripBoard detail={group} trip={trip} />
          </>
        ) : (
          <Loaded query={stacks.stats(group.group.id)} skeleton={skeleton}>
            {(stats) => (
              <>
                {header}
                <AllTime detail={group} stats={stats} />
              </>
            )}
          </Loaded>
        );
      }}
    </TripLoaded>
  );
}

/** All time: the race across every trip, a stat sheet, and the group's results by game and casino. */
function AllTime({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        The board counts closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const venues = new Map(stats.byVenue.map((row) => [row.key.id, row.key]));
  const trips = new Map(detail.trips.map((trip) => [trip.id, trip.name]));
  const sessions = stats.bySession.map((row) => ({
    session: { id: row.sessionId, startedAt: row.startedAt },
    tripId: row.tripId,
    venue: venues.get(row.venueId)!,
    results: row.results,
  }));
  const marks = sessions.flatMap((session, index) =>
    index === 0 || sessions[index - 1]!.tripId !== session.tripId
      ? [{ index, label: trips.get(session.tripId) ?? "" }]
      : [],
  );
  const currency = detail.group.currency;
  const tripCount = new Set(sessions.map((s) => s.tripId)).size;
  return (
    <>
      <TripHero
        currency={currency}
        me={detail.myPlayerId}
        sessions={sessions}
        label={`All time with ${detail.group.name}`}
        span={`${tripCount} ${tripCount === 1 ? "trip" : "trips"}`}
      />
      <RaceStats
        detail={detail}
        sessions={sessions}
        marks={marks}
        where={(session) => trips.get(session.tripId) ?? ""}
        empty="The board counts closed sessions, so close one to see how everyone's doing."
      />
      <Breakdown
        title="By game"
        rows={byNet(stats.byGame).map((row) => ({
          ...row,
          id: row.key,
          label: gameNames[row.key],
        }))}
        currency={currency}
      />
      <Breakdown
        title="By casino"
        rows={byNet(stats.byVenue).map((row) => ({ ...row, id: row.key.id, label: row.key.name }))}
        currency={currency}
      />
      {stats.bySeat.length > 0 ? (
        <Breakdown
          title="By blackjack seat"
          rows={stats.bySeat.map((row) => ({ ...row, id: row.key, label: seatLabel(row.key) }))}
          currency={currency}
        />
      ) : null}
      <Note>{playedSummary(stats.sessionCount, stats.minutesPlayed)}</Note>
    </>
  );
}
