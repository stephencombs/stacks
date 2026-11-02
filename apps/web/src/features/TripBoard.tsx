import type { GroupDetail, PlayerId, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import {
  awardLine,
  awardTitles,
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
  tripNights,
  tripStandings,
  tripStats,
} from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { EmptyState, Section } from "~/components/ui/Page";
import { List, Row, RowLink, RowText, Tag } from "~/components/ui/Surface";
import { Chip } from "./Chip";
import { PlayerName } from "./Player";
import { Standing } from "./Standing";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
          duration: 240,
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

/** The whole trip: the standings, who earned what, and its numbers. */
export function TripBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const awards = tripAwards(closed, localClock);
  const row = useReorder();

  if (standings.length === 0)
    return <EmptyState title="Nothing on the board yet">Close a session to start it.</EmptyState>;

  return (
    <>
      <Section title="Standings" aside={plural(closed.length, "session")}>
        <List as="ol" label="Standings">
          {standings.map((s) => {
            const streak = streakLine(s.streak);
            return (
              <Standing
                key={s.playerId}
                rowRef={row(s.playerId)}
                rank={s.rank}
                chip={chipOf(detail, s.playerId)}
                name={<PlayerName name={name(s.playerId)} you={s.playerId === detail.myPlayerId} />}
                meta={
                  <>
                    {plural(s.sessions, "session")}
                    {streak ? ` · ${streak}` : ""}
                    {s.moved === 0 ? null : (
                      <span className={s.moved > 0 ? "text-win" : "text-loss"}>
                        {s.moved > 0 ? ` · up ${s.moved} tonight` : ` · down ${-s.moved} tonight`}
                      </span>
                    )}
                  </>
                }
                net={s.net}
                currency={currency}
              />
            );
          })}
        </List>
      </Section>

      {awards.length > 0 ? (
        <Section title="Awards">
          <List>
            {awards.map((award) => (
              <Row key={award.key}>
                <Chip chip={chipOf(detail, award.playerId)} name={name(award.playerId)} size={28} />
                <RowText
                  title={awardTitles[award.key]}
                  meta={`${name(award.playerId)} · ${awardLine(award, currency)}`}
                />
              </Row>
            ))}
          </List>
        </Section>
      ) : null}

      <TripNumbers detail={detail} trip={trip} total={standings.reduce((n, s) => n + s.net, 0)} />
    </>
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
    <>
      {live.length > 0 ? (
        <Section title="At the tables">
          <List>
            {live.map((s) => (
              <RowLink
                key={s.session.id}
                to="/sessions/$sessionId"
                params={{ sessionId: s.session.id }}
              >
                <RowText title={s.venue.name} meta={`${s.playing.length} playing`} />
                <Tag tone="live">Live</Tag>
              </RowLink>
            ))}
          </List>
        </Section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Nothing on the board tonight">
          Results land here as players cash out.
        </EmptyState>
      ) : (
        <Section
          title="Who's up"
          aside={
            inPlayTotal > 0 ? (
              <>
                In play <Money amount={inPlayTotal} currency={currency} />
              </>
            ) : null
          }
        >
          <List as="ol" label="Tonight">
            {rows.map((r) => (
              <Standing
                key={r.playerId}
                rowRef={row(r.playerId)}
                rank={r.rank}
                chip={chipOf(detail, r.playerId)}
                name={<PlayerName name={name(r.playerId)} you={r.playerId === detail.myPlayerId} />}
                meta={
                  r.inPlay > 0 ? (
                    <>
                      In play <Money amount={r.inPlay} currency={currency} />
                    </>
                  ) : null
                }
                net={r.net}
                currency={currency}
              />
            ))}
          </List>
        </Section>
      )}
    </>
  );
}

/** The trip's totals, and how the group has run as a team. */
function TripNumbers({
  detail,
  trip,
  total,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  total: number;
}) {
  const currency = detail.group.currency;
  const stats = tripStats(trip.sessions.filter((s) => s.session.status === "closed"));
  const { current } = stats.team;
  const money = (n: number, tone: "plain" | "result" = "result") => (
    <Money amount={Math.round(n)} currency={currency} tone={tone} className="font-semibold" />
  );
  const number = (title: string, meta: string, value: ReactNode) => (
    <Row key={title}>
      <RowText title={title} meta={meta} />
      {value}
    </Row>
  );
  return (
    <Section title="The numbers">
      <List>
        {number("Table net", "Everyone's results added up", money(total))}
        {number("Gross wins", "Every winning result", money(stats.grossWins))}
        {number("Gross losses", "Every losing result", money(stats.grossLosses))}
        {number("Largest drawdown", "Biggest drop from a high", money(stats.drawdown))}
        {number(
          "Team record",
          current
            ? `${current.length} ${current.result === "win" ? (current.length === 1 ? "win" : "wins") : current.length === 1 ? "loss" : "losses"} in a row`
            : "A table counts when everyone won or everyone lost",
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {stats.record.wins}W · {stats.record.losses}L · {stats.record.mixed} mixed
          </span>,
        )}
        {stats.highLimit.sessions > 0
          ? number(
              "High limit",
              plural(stats.highLimit.sessions, "table"),
              money(stats.highLimit.net),
            )
          : null}
        {stats.highLimit.sessions > 0
          ? number(
              "Other tables",
              plural(stats.otherTables.sessions, "table"),
              money(stats.otherTables.net),
            )
          : null}
      </List>
    </Section>
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
    return <EmptyState title="No nights yet">Close a session to start the first one.</EmptyState>;
  return (
    <>
      {days.toReversed().map((day) => (
        <Section
          key={day.key}
          title={nightLabel(nights.find((n) => n.key === day.key)!)}
          aside={plural(day.sessions, "table")}
        >
          <List>
            {day.rows.map((row) => (
              <Row key={row.playerId}>
                <Chip
                  chip={chipOf(detail, row.playerId)}
                  name={names.get(row.playerId) ?? "?"}
                  size={28}
                />
                <RowText
                  title={
                    <PlayerName
                      name={names.get(row.playerId) ?? "Someone"}
                      you={row.playerId === detail.myPlayerId}
                    />
                  }
                  meta={
                    row.net === null
                      ? "No results recorded"
                      : recordLine(row.wins, row.losses, row.even)
                  }
                />
                {row.net === null ? (
                  <span className="text-faint">—</span>
                ) : (
                  <Money
                    amount={row.net}
                    currency={currency}
                    tone="result"
                    className="font-semibold"
                  />
                )}
              </Row>
            ))}
          </List>
        </Section>
      ))}
    </>
  );
}
