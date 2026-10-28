import { createFileRoute } from "@tanstack/react-router";
import { GroupId, type GroupDetail, type GroupStats, type PlayerResult } from "@stacks/contracts";
import { useState, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { EmptyState, SectionHeading, Skeleton, Surface } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { GroupHeader } from "~/features/GroupHeader";
import { NetChart } from "~/features/NetChart";
import { SessionBars } from "~/features/SessionBars";
import { Standings } from "~/features/Standings";
import { gameNames, playedSummary } from "@stacks/client-runtime/format";
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

const charts = [
  { key: "each", label: "Each session" },
  { key: "total", label: "Running total" },
] as const;

function StatsView({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  const [chart, setChart] = useState<(typeof charts)[number]["key"]>("each");
  const currency = detail.group.currency;
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const mine = (results: ReadonlyArray<PlayerResult>) =>
    results.find((result) => result.playerId === detail.myPlayerId);

  return (
    <>
      <p className="-mt-4 text-pretty text-muted">
        {playedSummary(stats.sessionCount, stats.minutesPlayed)}
      </p>

      <section className="flex flex-col gap-2">
        <SectionHeading>Standings</SectionHeading>
        <Surface>
          <Standings detail={detail} stats={stats} me={detail.myPlayerId} />
        </Surface>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>Your sessions</SectionHeading>
        <Surface className="flex flex-col gap-4 p-5">
          <div
            role="group"
            aria-label="Chart"
            className="flex gap-1 self-start rounded-xl bg-sunken p-1"
          >
            {charts.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={chart === option.key}
                onClick={() => setChart(option.key)}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-3 text-sm whitespace-nowrap transition-colors duration-150 pointer-coarse:h-10",
                  chart === option.key
                    ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]"
                    : "text-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {chart === "each" ? (
            <SessionBars stats={stats} playerId={detail.myPlayerId} currency={currency} />
          ) : (
            <NetChart stats={stats} playerId={detail.myPlayerId} currency={currency} />
          )}
        </Surface>
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
                  <span className="text-muted">—</span>
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
                  <span className="text-muted">—</span>
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
