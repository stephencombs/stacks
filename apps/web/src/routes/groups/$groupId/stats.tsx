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
import { gameNames, playedSummary, playerNames, whose } from "@stacks/client-runtime/format";
import { netFor, type Subject } from "@stacks/shared/results";
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
  const me = detail.myPlayerId;
  const [chart, setChart] = useState<(typeof charts)[number]["key"]>("each");
  const [subject, setSubject] = useState<Subject>(() =>
    stats.byPlayer.some((result) => result.playerId === me) ? me : "group",
  );
  const currency = detail.group.currency;
  if (stats.sessionCount === 0) {
    return (
      <EmptyState title="No finished sessions yet">
        Stats count closed sessions, so close one to see how everyone's doing.
      </EmptyState>
    );
  }
  const owner = whose(subject, me, playerNames(detail));
  const net = (results: ReadonlyArray<PlayerResult>) => {
    const amount = netFor(results, subject);
    return amount === undefined ? (
      <span className="text-muted">—</span>
    ) : (
      <Money amount={amount} currency={currency} tone="result" />
    );
  };
  const netColumn = subject === "group" ? "Group net" : `${owner} net`;

  return (
    <>
      <p className="-mt-4 text-pretty text-muted">
        {playedSummary(stats.sessionCount, stats.minutesPlayed)}
      </p>

      <section className="flex flex-col gap-2">
        <SectionHeading
          action={<span className="text-xs text-muted">Pick a row to see their stats</span>}
        >
          Standings
        </SectionHeading>
        <Surface>
          <Standings
            detail={detail}
            stats={stats}
            me={me}
            selected={subject}
            onSelect={setSubject}
          />
        </Surface>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>{`${owner} sessions`}</SectionHeading>
        <Surface className="flex flex-col gap-4 p-5">
          <div
            role="group"
            aria-label="Chart"
            className="flex gap-1 self-start rounded-lg bg-sunken p-1"
          >
            {charts.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={chart === option.key}
                onClick={() => setChart(option.key)}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-colors duration-150 pointer-coarse:h-10",
                  chart === option.key ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {chart === "each" ? (
            <SessionBars
              key={subject}
              stats={stats}
              subject={subject}
              whose={owner}
              currency={currency}
            />
          ) : (
            <NetChart
              key={subject}
              stats={stats}
              subject={subject}
              whose={owner}
              currency={currency}
            />
          )}
        </Surface>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>{`${owner} results by game`}</SectionHeading>
        <Table head={["Game", "Sessions", netColumn]}>
          {stats.byGame.map((row) => (
            <tr key={row.key}>
              <td className="px-5 py-3">{gameNames[row.key]}</td>
              <td className="px-5 py-3 text-right font-mono text-muted">{row.sessionCount}</td>
              <td className="px-5 py-3 text-right font-bold">{net(row.results)}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>{`${owner} results by venue`}</SectionHeading>
        <Table head={["Venue", "Sessions", netColumn]}>
          {stats.byVenue.map((row) => (
            <tr key={row.key.id}>
              <td className="px-5 py-3">{row.key.name}</td>
              <td className="px-5 py-3 text-right font-mono text-muted">{row.sessionCount}</td>
              <td className="px-5 py-3 text-right font-bold">{net(row.results)}</td>
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
          <tr className="border-b border-line text-left text-[11px] tracking-[0.16em] text-muted uppercase">
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
