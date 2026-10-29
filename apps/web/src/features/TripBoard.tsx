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
} from "@stacks/client-runtime/trip";
import { tripAwards, tripFeed, tripNights, tripStandings } from "@stacks/shared/trips";
import { useLayoutEffect, useRef } from "react";

import { cn } from "~/components/ui/cn";
import { Chip } from "./Chip";

const label = "text-[11px] font-semibold tracking-[0.18em] uppercase";
const tone = (n: number) =>
  n > 0 ? "text-board-win" : n < 0 ? "text-board-loss" : "text-board-muted";

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
  const live = trip.sessions.filter((s) => s.session.status === "live");
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
    <div className="-mx-4 flex flex-col overflow-hidden border-y border-board-rule bg-board text-board-ink sm:mx-0 sm:rounded-2xl sm:border">
      {ticker.length > 0 ? (
        <div className="overflow-hidden border-b border-board-rule bg-board-deep py-2">
          <div
            aria-hidden
            className="flex w-max animate-[ticker_40s_linear_infinite] gap-8 font-mono text-xs text-board-amber hover:[animation-play-state:paused] motion-reduce:animate-none"
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
            <p className={cn(label, "text-board-amber")}>
              {trip.trip.endedAt === null ? "On the board" : "Final board"}
            </p>
            <p className="truncate font-display text-4xl leading-none tracking-tight uppercase">
              {tonight ? nightLabel(tonight) : "Before the first hand"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className={cn(label, "text-board-muted")}>Table</span>
            <span className={cn("font-mono text-lg tabular-nums", tone(total))}>
              {boardMoney(total, currency)}
            </span>
          </div>
        </header>

        {live.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {live.map((s) => (
              <li key={s.session.id}>
                <Link
                  to="/sessions/$sessionId"
                  params={{ sessionId: s.session.id }}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-board-rule bg-board-panel px-3 py-2"
                >
                  <span className="size-2 animate-pulse rounded-full bg-board-loss motion-reduce:animate-none" />
                  <span className={cn(label, "text-board-loss")}>Live</span>
                  <span className="flex-1 truncate font-display text-lg tracking-wide uppercase">
                    {s.venue.name}
                  </span>
                  <span className="font-mono text-xs text-board-muted">
                    {s.results.length || "—"} in
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        <section className="flex flex-col gap-2">
          <div className={cn("flex items-center justify-between", label, "text-board-muted")}>
            <h2>The board</h2>
            <span>
              {closed.length} {closed.length === 1 ? "session" : "sessions"}
            </span>
          </div>
          {standings.length === 0 ? (
            <p className="rounded-xl border border-board-rule bg-board-panel p-4 text-sm text-board-muted">
              The board fills in when the trip's first session closes. Start one and play.
            </p>
          ) : (
            <ol className="relative overflow-hidden rounded-xl border border-board-rule bg-board-panel">
              {standings.map((s) => (
                <li
                  key={s.playerId}
                  ref={row(s.playerId)}
                  className={cn(
                    "relative grid grid-cols-[1.75rem_1.75rem_auto_1fr_auto] items-center gap-2.5 border-t border-board-rule bg-board-panel px-3 py-3 first:border-t-0",
                    s.playerId === detail.myPlayerId &&
                      "shadow-[inset_3px_0_0_var(--color-board-amber)]",
                  )}
                >
                  <span className="font-mono text-xl font-bold text-board-amber tabular-nums">
                    {s.rank}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      s.moved > 0 ? "text-board-win" : "text-board-loss",
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
                        <span className="rounded-sm bg-board-amber px-1 font-mono text-[10px] font-bold text-board-amber-ink">
                          HOT
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-board-muted">
                      {s.sessions} SESS
                      {s.playerId === detail.myPlayerId ? " · YOU" : ""}
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

        {awards.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className={cn(label, "text-board-muted")}>Props hit</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {awards.map((award) => (
                <li
                  key={award.key}
                  className="flex flex-col gap-2 rounded-xl border border-board-rule bg-board-panel p-3"
                >
                  <span className={cn(label, "text-board-amber")}>{awardTitles[award.key]}</span>
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
                  <span className="text-xs text-pretty text-board-muted">
                    {awardLine(award, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {nights.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className={cn(label, "text-board-muted")}>Night by night</h2>
            <table className="w-full font-mono text-sm">
              <tbody className="divide-y divide-board-rule">
                {nights.toReversed().map((night) => (
                  <tr key={night.key}>
                    <td className="py-2.5 pr-3 text-board-amber">D{night.number}</td>
                    <td className="py-2.5 pr-3 uppercase">
                      {nightLabel(night).split(" · ")[1]!.slice(0, 3)}
                    </td>
                    <td className="py-2.5 pr-3 text-board-muted">{night.sessions.length} sess</td>
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
