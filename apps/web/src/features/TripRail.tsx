import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { formatDay, gameNames, playerNames } from "@stacks/client-runtime/format";
import { balanceHeadline, chipOf, localClock } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { ButtonLink } from "~/components/ui/Button";
import { cn } from "~/components/ui/cn";
import { Glow, Surface } from "~/components/ui/Surface";
import { Chip } from "./Chip";
import { LiveSessionCard } from "./SessionList";

/**
 * A trip page on a wide screen: its own content on the left, and on the right the rest of the trip
 * you'd otherwise tab to. Below `lg` the rail drops away and the page is the phone layout.
 */
export function TripLayout({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
      <aside
        aria-label="The rest of this trip"
        className="sticky top-6 hidden flex-col gap-6 lg:flex"
      >
        {rail}
      </aside>
    </div>
  );
}

/** What the rail holds: your live table, the board and your balance, less whichever page you're on. */
export function TripRail({
  group,
  trip,
  on,
}: {
  group: GroupDetail;
  trip: TripDetail;
  on: "sessions" | "results" | "settle";
}) {
  const mine = trip.sessions.find(
    (s) => s.session.status === "live" && s.playerIds.includes(group.myPlayerId),
  );
  return (
    <>
      {mine ? <LiveSessionCard summary={mine} detail={group} /> : null}
      {on === "results" ? null : <RailBoard group={group} trip={trip} />}
      {on === "settle" ? null : <RailBalance group={group} trip={trip} />}
    </>
  );
}

function RailBoard({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock).toSorted((a, b) => a.rank - b.rank);
  const names = playerNames(group);
  if (standings.length === 0) return null;
  return (
    <Surface className="overflow-hidden">
      <div className="flex min-h-12 items-center justify-between pr-2 pl-4">
        <h2 className="font-semibold">Board</h2>
        <Link
          to="/trips/$tripId/results"
          params={{ tripId: trip.trip.id }}
          className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm text-muted transition-colors duration-150 hover:text-ink"
        >
          Results
        </Link>
      </div>
      <ol className="pb-1">
        {standings.map((s) => {
          const name = names.get(s.playerId) ?? "Player";
          const you = s.playerId === group.myPlayerId;
          return (
            <li
              key={s.playerId}
              className={cn(
                "flex min-h-12 items-center gap-3 px-4",
                you && "shadow-[inset_3px_0_0_var(--color-accent)]",
              )}
            >
              <span className="w-4 shrink-0 text-center text-sm text-muted tabular-nums">
                {s.rank}
              </span>
              <Chip chip={chipOf(group, s.playerId)} name={name} size={24} />
              <span className="min-w-0 flex-1 truncate font-medium" title={name}>
                {name}
                {you ? <span className="font-normal text-muted"> (you)</span> : null}
              </span>
              <Money
                amount={s.net}
                currency={group.group.currency}
                tone="result"
                className="font-semibold"
              />
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}

function RailBalance({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const me = group.myPlayerId;
  const balance = trip.balances.find((b) => b.playerId === me)?.amount ?? 0;
  const payments = trip.transfers.filter((t) => t.from === me || t.to === me).length;
  const head = balanceHeadline(balance, payments);
  return (
    <Surface className="relative overflow-hidden">
      <Glow tone={head.tone} />
      <div className="relative flex flex-col p-4">
        <h2 className="text-sm font-medium text-muted">{head.label}</h2>
        <Money
          amount={Math.abs(balance)}
          currency={group.group.currency}
          className={cn(
            "mt-2 font-display text-4xl leading-none tracking-[-0.01em]",
            balance > 0 ? "text-win" : balance < 0 ? "text-loss" : "text-muted",
          )}
        />
        {head.line ? <p className="mt-1.5 text-sm text-muted">{head.line}</p> : null}
        <ButtonLink
          to="/trips/$tripId/settle"
          params={{ tripId: trip.trip.id }}
          className="mt-4 pr-3.5"
        >
          Settle up
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </Surface>
  );
}

/** Past sessions as a table, for screens wide enough to read them across. */
export function SessionTable({
  sessions,
  group,
}: {
  sessions: TripDetail["sessions"];
  group: GroupDetail;
}) {
  const currency = group.group.currency;
  return (
    <Surface className="overflow-hidden">
      <table className="w-full text-left">
        <thead className="text-sm text-muted">
          <tr className="border-b border-line">
            <th scope="col" className="w-[44%] px-4 py-3 font-normal">
              Venue
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Day
            </th>
            <th scope="col" className="hidden px-4 py-3 text-right font-normal xl:table-cell">
              Players
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              Table in
            </th>
            <th scope="col" className="px-4 py-3 text-right font-normal">
              You
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const mine = s.results.find((r) => r.playerId === group.myPlayerId);
            return (
              <tr
                key={s.session.id}
                className="relative border-b border-line transition-colors duration-150 last:border-0 has-[a:focus-visible]:bg-sunken [@media(hover:hover)]:hover:bg-sunken"
              >
                <td className="max-w-0 px-4 py-3">
                  {/* The venue's link covers the whole row, so the row clicks as one. */}
                  <Link
                    to="/sessions/$sessionId"
                    params={{ sessionId: s.session.id }}
                    className="block truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink"
                  >
                    {s.venue.name}
                  </Link>
                  <span className="block text-sm text-muted">{gameNames[s.session.game]}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {formatDay(s.session.startedAt)}
                </td>
                <td className="hidden px-4 py-3 text-right text-muted tabular-nums xl:table-cell">
                  {s.playerIds.length}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  <Money amount={s.results.reduce((n, r) => n + r.buyIn, 0)} currency={currency} />
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                  {mine ? (
                    <Money amount={mine.net} currency={currency} tone="result" />
                  ) : (
                    <span className="font-normal text-muted">Sat out</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Surface>
  );
}
