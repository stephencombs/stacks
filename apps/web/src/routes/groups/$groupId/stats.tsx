import { createFileRoute } from "@tanstack/react-router";
import { GroupId, type GroupDetail, type GroupStats, type PlayerResult } from "@stacks/contracts";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { EmptyState, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { GroupHeader } from "~/features/GroupHeader";
import { playerNames } from "@stacks/client-runtime/format";
import { gameNames } from "@stacks/client-runtime/format";
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

const byNet = (a: PlayerResult, b: PlayerResult) => b.net - a.net;

function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const hours = Math.round(stats.minutesPlayed / 6) / 10;
  const mine = (results: ReadonlyArray<PlayerResult>) =>
    results.find((result) => result.playerId === detail.myPlayerId);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Surface className="flex flex-col gap-1 px-5 py-4">
          <span className="text-sm text-muted">Sessions</span>
          <span className="font-serif text-3xl tabular-nums">{stats.sessionCount}</span>
        </Surface>
        <Surface className="flex flex-col gap-1 px-5 py-4">
          <span className="text-sm text-muted">Hours played</span>
          <span className="font-serif text-3xl tabular-nums">{hours}</span>
        </Surface>
      </div>

      <section className="flex flex-col gap-2">
        <SectionHeading>Everyone, all time</SectionHeading>
        <Table head={["Player", "Bought in", "Net"]}>
          {stats.byPlayer.toSorted(byNet).map((result) => (
            <tr key={result.playerId}>
              <td className="px-5 py-3">{names.get(result.playerId)}</td>
              <td className="px-5 py-3 text-right">
                <Money amount={result.buyIn} currency={currency} className="text-muted" />
              </td>
              <td className="px-5 py-3 text-right font-medium">
                <Money amount={result.net} currency={currency} tone="result" />
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Your results by game</SectionHeading>
        <Table head={["Game", "Sessions", "Your net"]}>
          {stats.byGame.map((row) => (
            <tr key={row.key}>
              <td className="px-5 py-3">{gameNames[row.key]}</td>
              <td className="px-5 py-3 text-right text-muted tabular-nums">{row.sessionCount}</td>
              <td className="px-5 py-3 text-right font-medium">
                {mine(row.results) ? (
                  <Money amount={mine(row.results)!.net} currency={currency} tone="result" />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Your results by venue</SectionHeading>
        <Table head={["Venue", "Sessions", "Your net"]}>
          {stats.byVenue.map((row) => (
            <tr key={row.key.id}>
              <td className="px-5 py-3">{row.key.name}</td>
              <td className="px-5 py-3 text-right text-muted tabular-nums">{row.sessionCount}</td>
              <td className="px-5 py-3 text-right font-medium">
                {mine(row.results) ? (
                  <Money amount={mine(row.results)!.net} currency={currency} tone="result" />
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </section>
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
                  index === 0 ? "px-5 py-2.5 font-medium" : "px-5 py-2.5 text-right font-medium"
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
