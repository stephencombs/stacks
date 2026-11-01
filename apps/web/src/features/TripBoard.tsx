import { Link } from "@tanstack/react-router";
import type { GroupDetail, PlayerId, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import {
  awardLine,
  awardTitles,
  boardMoney,
  chipOf,
  localClock,
  nightLabel,
  recordLine,
  streakLine,
} from "@stacks/client-runtime/trip";
import {
  tonightBoard,
  tripAwards,
  tripDays,
  tripFeed,
  tripNights,
  tripStandings,
  tripStats,
} from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useLayoutEffect, useRef } from "react";

import { cn } from "~/components/ui/cn";
import { Chip } from "./Chip";

// Board readouts: small mono caps, like the labels on a sportsbook screen.
const label = "font-mono text-[11px] tracking-[0.08em] uppercase";
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

/**
 * Slides board rows to their new places when the order changes while you watch. Rows move on
 * screen, so ease-in-out. Measuring after every render is cheap for a handful of rows.
 */
function useReorder() {
  const rows = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key, row] of rows.current) {
      const top = row.offsetTop;
      const before = tops.current.get(key);
      if (before !== undefined && before !== top && !still) {
        row.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], {
          duration: 450,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        });
      }
      tops.current.set(key, top);
    }
  });
  return (key: string) => (row: HTMLElement | null) => {
    if (row) rows.current.set(key, row);
    else rows.current.delete(key);
  };
}

/** The trip as a casino sportsbook board: ticker, standings, awards and night-by-night. */
export function TripBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const nights = tripNights(closed, localClock);
  const awards = tripAwards(closed, localClock);
  const feed = tripFeed(closed);
  const tonight = nights.at(-1);
  const total = standings.reduce((sum, s) => sum + s.net, 0);
  const row = useReorder();
  // Two copies back to back, so sliding by one copy's width loops without a seam.
  const ticker = ["a", "b"].flatMap((copy) =>
    feed.map((f) => ({
      key: `${copy}-${f.session.session.id}-${f.playerId}`,
      text: `${name(f.playerId).toUpperCase()} ${boardMoney(f.net, currency)} · ${f.session.venue.name.toUpperCase()}`,
    })),
  );

  return (
    <div className="flex flex-col">
      {ticker.length > 0 ? (
        <div className="overflow-hidden border-b border-line bg-sunken py-2">
          <div
            aria-hidden
            className="flex w-max animate-[ticker_40s_linear_infinite] gap-8 font-mono text-xs text-accent-text hover:[animation-play-state:paused] motion-reduce:animate-none"
          >
            {ticker.map((item) => (
              <span key={item.key} className="whitespace-nowrap">
                {item.text}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-7 px-4 pt-6 pb-8 sm:px-6">
        <header className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={cn(label, "text-muted")}>
              {trip.trip.endedAt === null ? "On the board" : "Final board"}
            </p>
            <p className="truncate font-display text-4xl leading-none tracking-tight uppercase">
              {tonight ? nightLabel(tonight) : "Before the first hand"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className={cn(label, "text-muted")}>Table</span>
            <span className={cn("font-mono text-lg tabular-nums", tone(total))}>
              {boardMoney(total, currency)}
            </span>
          </div>
        </header>

        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">The board</h2>
            <span className={cn(label, "text-muted")}>
              {closed.length} {closed.length === 1 ? "session" : "sessions"}
            </span>
          </div>
          {standings.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
              Close a session to put it on the board.
            </p>
          ) : (
            <ol className="relative overflow-hidden rounded-xl border border-line bg-surface">
              {standings.map((s) => (
                <li
                  key={s.playerId}
                  ref={row(s.playerId)}
                  className={cn(
                    "relative grid grid-cols-[1.5rem_auto_auto_1fr_auto] items-center gap-2.5 border-t border-line bg-surface px-3 py-3 first:border-t-0",
                    s.playerId === detail.myPlayerId &&
                      "shadow-[inset_3px_0_0_var(--color-accent)]",
                  )}
                >
                  <span className="font-mono text-xl font-bold text-accent-text tabular-nums">
                    {s.rank}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      s.moved > 0 ? "text-win" : "text-loss",
                    )}
                    aria-label={
                      s.moved === 0
                        ? undefined
                        : s.moved > 0
                          ? `Up ${s.moved} tonight`
                          : `Down ${-s.moved} tonight`
                    }
                  >
                    {s.moved === 0 ? "" : `${s.moved > 0 ? "▲" : "▼"}${Math.abs(s.moved)}`}
                  </span>
                  <Chip chip={chipOf(detail, s.playerId)} name={name(s.playerId)} size={30} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-lg leading-tight tracking-wide uppercase">
                        {name(s.playerId)}
                      </span>
                      {s.hot ? (
                        <span className="rounded-sm bg-accent px-1 font-mono text-[10px] font-bold text-accent-ink">
                          HOT
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {s.sessions} SESS
                      {s.playerId === detail.myPlayerId ? " · YOU" : ""}
                      {streakLine(s.streak) ? ` · ${streakLine(s.streak)!.toUpperCase()}` : ""}
                    </span>
                  </span>
                  <span className={cn("font-mono text-xl font-bold tabular-nums", tone(s.net))}>
                    {boardMoney(s.net, currency)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {closed.length > 0 ? <TripNumbers detail={detail} trip={trip} /> : null}

        {awards.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold">Awards</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {awards.map((award) => (
                <li
                  key={award.key}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3"
                >
                  <span className={cn(label, "text-muted")}>{awardTitles[award.key]}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Chip
                      chip={chipOf(detail, award.playerId)}
                      name={name(award.playerId)}
                      size={22}
                    />
                    <span className="truncate font-display text-lg leading-tight tracking-wide uppercase">
                      {name(award.playerId)}
                    </span>
                  </span>
                  <span className="text-xs text-pretty text-muted">
                    {awardLine(award, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {nights.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold">Night by night</h2>
            <table className="w-full font-mono text-sm">
              <tbody className="divide-y divide-line">
                {nights.toReversed().map((night) => (
                  <tr key={night.key}>
                    <td className="py-2.5 pr-3 text-accent-text">D{night.number}</td>
                    <td className="py-2.5 pr-3 uppercase">
                      {nightLabel(night).split(" · ")[1]!.slice(0, 3)}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{night.sessions.length} sess</td>
                    <td className="truncate py-2.5 pr-3 uppercase">
                      {night.winner ? name(night.winner.playerId) : "—"}
                    </td>
                    <td
                      className={cn("py-2.5 text-right tabular-nums", tone(night.winner?.net ?? 0))}
                    >
                      {night.winner ? boardMoney(night.winner.net, currency) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** Tonight only: who's up from tables that finished, and what's still in play at live ones. */
export function TonightBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const live = trip.sessions.filter((s) => s.session.status === "live");
  const rows = tonightBoard(closed, live, localClock, DateTime.nowUnsafe());
  const inPlayTotal = rows.reduce((sum, r) => sum + r.inPlay, 0);
  const row = useReorder();

  return (
    <div className="flex flex-col gap-7 px-4 pt-6 pb-8 sm:px-6">
      <header className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={cn(label, "text-muted")}>Who's up</p>
          <p className="font-display text-4xl leading-none tracking-tight uppercase">Tonight</p>
        </div>
        {inPlayTotal > 0 ? (
          <div className="flex shrink-0 flex-col items-end">
            <span className={cn(label, "text-muted")}>In play</span>
            <span className="font-mono text-lg text-accent-text tabular-nums">
              {boardMoney(inPlayTotal, currency, false)}
            </span>
          </div>
        ) : null}
      </header>

      {live.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {live.map((s) => (
            <li key={s.session.id}>
              <Link
                to="/sessions/$sessionId"
                params={{ sessionId: s.session.id }}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2"
              >
                <span className="size-2 animate-pulse rounded-full bg-loss motion-reduce:animate-none" />
                <span className={cn(label, "text-loss")}>Live</span>
                <span className="flex-1 truncate font-medium">{s.venue.name}</span>
                <span className="font-mono text-xs text-muted">{s.playing.length} playing</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Nothing on the board tonight. Results land here as players cash out.
        </p>
      ) : (
        <ol
          aria-label="Tonight"
          className="relative overflow-hidden rounded-xl border border-line bg-surface"
        >
          {rows.map((r) => (
            <li
              key={r.playerId}
              ref={row(r.playerId)}
              className={cn(
                "relative grid grid-cols-[1.5rem_auto_1fr_auto] items-center gap-2.5 border-t border-line bg-surface px-3 py-3 first:border-t-0",
                r.playerId === detail.myPlayerId && "shadow-[inset_3px_0_0_var(--color-accent)]",
              )}
            >
              <span className="font-mono text-xl font-bold text-accent-text tabular-nums">
                {r.rank}
              </span>
              <Chip chip={chipOf(detail, r.playerId)} name={name(r.playerId)} size={30} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-display text-lg leading-tight tracking-wide uppercase">
                  {name(r.playerId)}
                </span>
                <span className="font-mono text-xs text-muted">
                  {r.inPlay > 0 ? (
                    <span className="text-accent-text">
                      IN PLAY {boardMoney(r.inPlay, currency, false)}
                    </span>
                  ) : null}
                  {r.inPlay > 0 && r.playerId === detail.myPlayerId ? " · " : ""}
                  {r.playerId === detail.myPlayerId ? "YOU" : ""}
                </span>
              </span>
              {r.net === null ? (
                <span className="font-mono text-xl text-faint" aria-label="No result yet">
                  —
                </span>
              ) : (
                <span className={cn("font-mono text-xl font-bold tabular-nums", tone(r.net))}>
                  {boardMoney(r.net, currency)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** How the group ran as a team, and the trip's numbers: totals, extremes, drawdown, high limit. */
function TripNumbers({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const stats = tripStats(trip.sessions.filter((s) => s.session.status === "closed"));
  const money = (n: number) => boardMoney(Math.round(n), currency);
  const { current, longestWin, longestLoss } = stats.team;
  const tiles: ReadonlyArray<{ label: string; value: string; tone: number; note?: string }> = [
    {
      label: "Gross wins",
      value: boardMoney(stats.grossWins, currency, false),
      tone: 1,
      note: "Every winning result",
    },
    {
      label: "Gross losses",
      value: money(stats.grossLosses),
      tone: -1,
      note: "Every losing result",
    },
    { label: "Average table", value: money(stats.average), tone: stats.average },
    {
      label: "Largest drawdown",
      value: money(stats.drawdown),
      tone: stats.drawdown,
      note: "Biggest drop from a high",
    },
    ...(stats.best
      ? [
          {
            label: "Best result",
            value: money(stats.best.net),
            tone: stats.best.net,
            note: names.get(stats.best.playerId) ?? "",
          },
        ]
      : []),
    ...(stats.worst
      ? [
          {
            label: "Worst result",
            value: money(stats.worst.net),
            tone: stats.worst.net,
            note: names.get(stats.worst.playerId) ?? "",
          },
        ]
      : []),
    ...(stats.highLimit.sessions > 0
      ? [
          {
            label: "High limit",
            value: money(stats.highLimit.net),
            tone: stats.highLimit.net,
            note: `${stats.highLimit.sessions} ${stats.highLimit.sessions === 1 ? "table" : "tables"}`,
          },
          {
            label: "Other tables",
            value: money(stats.otherTables.net),
            tone: stats.otherTables.net,
            note: `${stats.otherTables.sessions} ${stats.otherTables.sessions === 1 ? "table" : "tables"}`,
          },
        ]
      : []),
  ];
  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">As a team</h2>
          <span className={cn(label, "text-muted")}>
            {`${stats.record.wins}W · ${stats.record.losses}L · ${stats.record.mixed} mixed`}
          </span>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <p
            className={cn(
              "font-display text-2xl leading-none tracking-wide uppercase",
              current ? (current.result === "win" ? "text-win" : "text-loss") : "text-muted",
            )}
          >
            {current
              ? `${current.length} ${current.result === "win" ? (current.length === 1 ? "win" : "wins") : current.length === 1 ? "loss" : "losses"} in a row`
              : "No run going"}
          </p>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className={cn(label, "text-muted")}>Best run</dt>
              <dd className="font-mono tabular-nums">{longestWin}</dd>
            </div>
            <div>
              <dt className={cn(label, "text-muted")}>Worst run</dt>
              <dd className="font-mono tabular-nums">{longestLoss}</dd>
            </div>
            <div>
              <dt className={cn(label, "text-muted")}>Team wins</dt>
              <dd className="font-mono tabular-nums">{Math.round(stats.winRate * 100)}%</dd>
            </div>
          </dl>
          <p className="text-xs text-pretty text-muted">
            A team win is a table where everyone who played won; a team loss, where everyone lost.
            Anything else is mixed and ends a run.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">The numbers</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div
              key={tile.label}
              className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-3"
            >
              <dt className={cn(label, "text-muted")}>{tile.label}</dt>
              <dd className={cn("font-mono text-lg font-bold tabular-nums", tone(tile.tone))}>
                {tile.value}
              </dd>
              {tile.note ? <dd className="truncate text-xs text-muted">{tile.note}</dd> : null}
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

/** The trip night by night: every player's net, with their record, or that they sat it out. */
export function DaysBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const players = [...new Set(closed.flatMap((s) => s.results.map((r) => r.playerId)))];
  const days = tripDays(closed, localClock, players);
  const nights = tripNights(closed, localClock);
  if (days.length === 0)
    return (
      <p className="mx-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted sm:mx-6">
        Close a session to start the first night.
      </p>
    );
  return (
    <div className="flex flex-col gap-4 px-4 pb-8 sm:px-6">
      {days.toReversed().map((day) => (
        <section key={day.key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl tracking-wide uppercase">
              {nightLabel(nights.find((n) => n.key === day.key)!)}
            </h2>
            <span className={cn(label, "text-muted")}>
              {day.sessions} {day.sessions === 1 ? "table" : "tables"}
            </span>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {day.rows.map((row) => (
              <li key={row.playerId} className="flex items-center gap-3 px-3 py-3">
                <Chip
                  chip={chipOf(detail, row.playerId)}
                  name={names.get(row.playerId) ?? "?"}
                  size={26}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{names.get(row.playerId) ?? "Someone"}</span>
                  <span className="font-mono text-xs text-muted">
                    {row.net === null
                      ? "No results recorded"
                      : recordLine(row.wins, row.losses, row.even)}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono text-lg font-bold tabular-nums",
                    row.net === null ? "text-muted" : tone(row.net),
                  )}
                >
                  {row.net === null ? "—" : boardMoney(row.net, currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
