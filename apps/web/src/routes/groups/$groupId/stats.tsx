import { createFileRoute } from "@tanstack/react-router";
import {
  GroupId,
  MinorUnits,
  type GroupDetail,
  type GroupStats,
  type PlayerResult,
} from "@stacks/contracts";
import { gameNames, playedSummary } from "@stacks/client-runtime/format";
import { seatLabel } from "@stacks/client-runtime/table";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { EmptyState, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { GroupHeader } from "~/features/GroupHeader";
import { RaceStats } from "~/features/RaceStats";
import { Loaded, useStacks } from "~/lib/stacks";

export const Route = createFileRoute("/groups/$groupId/stats")({ component: Stats });

function Stats() {
  const { groupId } = Route.useParams();
  const stacks = useStacks();
  const id = GroupId.make(groupId);
  return (
    <Loaded query={stacks.group(id)} skeleton={<Skeleton className="mt-4 h-96" />}>
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

  return (
    <>
      <p className="-mt-2 text-pretty text-muted">
        {playedSummary(stats.sessionCount, stats.minutesPlayed)}
      </p>

      <RaceStats
        detail={detail}
        sessions={sessions}
        marks={marks}
        where={(session) => trips.get(session.tripId) ?? ""}
        latest="All-time"
        empty="Stats count closed sessions, so close one to see how everyone's doing."
      />

      <section className="flex flex-col gap-2">
        <SectionHeading>By game</SectionHeading>
        <Table head={["Game", "Sessions", "Table net"]}>
          {byNet(stats.byGame).map((row) => (
            <tr key={row.key}>
              <td className="px-3 py-3 sm:px-5">{gameNames[row.key]}</td>
              <td className="px-3 py-3 sm:px-5 text-right font-mono text-muted">
                {row.sessionCount}
              </td>
              <td className="px-3 py-3 sm:px-5 text-right font-bold">
                <Money amount={tableNet(row.results)} currency={currency} tone="result" />
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>By casino</SectionHeading>
        <Table head={["Casino", "Sessions", "Table net"]}>
          {byNet(stats.byVenue).map((row) => (
            <tr key={row.key.id}>
              <td className="px-3 py-3 sm:px-5">{row.key.name}</td>
              <td className="px-3 py-3 sm:px-5 text-right font-mono text-muted">
                {row.sessionCount}
              </td>
              <td className="px-3 py-3 sm:px-5 text-right font-bold">
                <Money amount={tableNet(row.results)} currency={currency} tone="result" />
              </td>
            </tr>
          ))}
        </Table>
      </section>

      {stats.bySeat.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeading>By blackjack seat</SectionHeading>
          <Table head={["Seat", "Sessions", "Table net"]}>
            {stats.bySeat.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-3 sm:px-5">{seatLabel(row.key)}</td>
                <td className="px-3 py-3 sm:px-5 text-right font-mono text-muted">
                  {row.sessionCount}
                </td>
                <td className="px-3 py-3 sm:px-5 text-right font-bold">
                  <Money amount={tableNet(row.results)} currency={currency} tone="result" />
                </td>
              </tr>
            ))}
          </Table>
        </section>
      ) : null}
    </>
  );
}

function Table({ head, children }: { head: ReadonlyArray<string>; children: ReactNode }) {
  return (
    <Surface className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            {head.map((label, index) => (
              <th
                key={label}
                className={
                  index === 0
                    ? "px-3 py-2.5 font-medium sm:px-5"
                    : "px-3 py-2.5 text-right font-medium sm:px-5"
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </Surface>
  );
}
