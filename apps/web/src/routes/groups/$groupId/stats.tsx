import { createFileRoute } from "@tanstack/react-router";
import {
  GroupId,
  MinorUnits,
  type CurrencyCode,
  type GroupDetail,
  type GroupStats,
  type PlayerResult,
} from "@stacks/contracts";
import { gameNames, playedSummary } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";

import { Money } from "~/components/Money";
import { EmptyState, Note, Section } from "~/components/ui/Page";
import { Skeleton, Surface } from "~/components/ui/Surface";
import { GroupHeader } from "~/features/GroupHeader";
import { RaceStats } from "~/features/RaceStats";
import { TripHero } from "~/features/TripHero";
import { Loaded, useStacks } from "~/lib/stacks";
import { GroupPageSkeleton } from "~/features/PageSkeletons";

export const Route = createFileRoute("/groups/$groupId/stats")({ component: Stats });

function Stats() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  const id = GroupId.make(groupId);
  return (
    <Loaded query={stacks.group(id)} skeleton={<GroupPageSkeleton hero />}>
      {(detail) => (
        <>
          <GroupHeader detail={detail} current="stats" />
          <Loaded query={stacks.stats(id)} skeleton={<Skeleton className="h-64" />}>
            {(stats) => <StatsView detail={detail} stats={stats} />}
          </Loaded>
        </>
      )}
    </Loaded>
  );
}

const tableNet = (results: ReadonlyArray<PlayerResult>) =>
  MinorUnits.make(results.reduce((sum, result) => sum + result.net, 0));

/** All-time: the race across every trip, a stat sheet, and the group's results by game and casino. */
function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
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
  const byNet = <R extends { results: ReadonlyArray<PlayerResult> }>(rows: ReadonlyArray<R>) =>
    rows.toSorted((a, b) => tableNet(b.results) - tableNet(a.results));

  const tripCount = new Set(sessions.map((s) => s.tripId)).size;
  return (
    <>
      <TripHero
        currency={detail.group.currency}
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
        empty="Stats count closed sessions, so close one to see how everyone's doing."
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

function Breakdown({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: ReadonlyArray<{
    readonly id: string | number;
    readonly label: string;
    readonly sessionCount: number;
    readonly results: ReadonlyArray<PlayerResult>;
  }>;
  currency: CurrencyCode;
}) {
  return (
    <Section title={title}>
      <Surface className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th className="px-4 py-2.5 text-left font-normal">
                <span className="sr-only">{title}</span>
              </th>
              <th className="px-4 py-2.5 text-right font-normal">Sessions</th>
              <th className="px-4 py-2.5 text-right font-normal">Table net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium">{row.label}</td>
                <td className="px-4 py-3 text-right text-muted tabular-nums">{row.sessionCount}</td>
                <td className="px-4 py-3 text-right font-semibold">
                  <Money amount={tableNet(row.results)} currency={currency} tone="result" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </Section>
  );
}
