import type { GroupDetail, PlayerId, SessionId, TripDetail } from "@stacks/contracts";
import { playerNames } from "@stacks/client-runtime/format";
import {
  awardLine,
  awardTitles,
  chipOf,
  localClock,
  streakLine,
} from "@stacks/client-runtime/trip";
import { tonightBoard, tripAwards, tripStandings, tripStats } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { EmptyState, Note, Section } from "~/components/ui/Page";
import { List, Row, RowText } from "~/components/ui/Surface";
import { Breakdown, byNet } from "./Breakdown";
import { Chip } from "./Chip";
import { RaceHero } from "./RaceHero";
import { PlayerName } from "./Player";
import { PlayerSheet } from "./RaceStats";
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

/**
 * The trip's board: the race, the standings, and the numbers of whoever's picked in them (you, once
 * you've played), then who earned what and where the table won.
 */
export function TripBoard({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const awards = tripAwards(closed, localClock);
  const row = useReorder();
  const [picked, setPicked] = useState<PlayerId | null>(null);
  const sheet = useRef<HTMLElement>(null);

  if (standings.length === 0)
    return <EmptyState title="Nothing on the board yet">Close a session to start it.</EmptyState>;

  const focus =
    standings.find((s) => s.playerId === picked) ??
    standings.find((s) => s.playerId === detail.myPlayerId) ??
    standings.find((s) => s.rank === 1)!;
  const venues = Map.groupBy(closed, (s) => s.venue.id);

  return (
    <>
      <RaceHero detail={detail} trip={trip} />
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
                        {` · ${s.moved > 0 ? "up" : "down"} ${plural(Math.abs(s.moved), "place")} tonight`}
                      </span>
                    )}
                  </>
                }
                net={s.net}
                currency={currency}
                picked={s.playerId === focus.playerId}
                onPick={() => {
                  setPicked(s.playerId);
                  // On a phone their numbers start a screen below; bring them up to meet the tap.
                  const el = sheet.current;
                  if (el && el.getBoundingClientRect().top > innerHeight * 0.6)
                    el.scrollIntoView({
                      block: "start",
                      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                        ? "auto"
                        : "smooth",
                    });
                }}
              />
            );
          })}
        </List>
        <Note>Pick a player to see their numbers.</Note>
      </Section>

      <PlayerSheet
        ref={sheet}
        key={focus.playerId}
        sessions={closed}
        player={{
          playerId: focus.playerId,
          name: name(focus.playerId),
          chip: chipOf(detail, focus.playerId),
        }}
        rank={focus.rank}
        of={standings.length}
        currency={currency}
      />

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

      <Breakdown
        title="By casino"
        rows={byNet(
          [...venues.values()].map((sessions) => ({
            id: sessions[0]!.venue.id,
            label: sessions[0]!.venue.name,
            sessionCount: sessions.length,
            results: sessions.flatMap((s) => s.results),
          })),
        )}
        currency={currency}
      />

      <TripNumbers detail={detail} trip={trip} total={standings.reduce((n, s) => n + s.net, 0)} />
    </>
  );
}

/**
 * Tonight across every table, on a live session's page: who's up from tables that finished, and
 * what's still in play. Left out when this table is the whole night, since the table says it all.
 */
export function Tonight({
  detail,
  trip,
  sessionId,
}: {
  detail: GroupDetail;
  trip: TripDetail;
  sessionId: SessionId;
}) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const name = (playerId: PlayerId) => names.get(playerId) ?? "Someone";
  const now = DateTime.nowUnsafe();
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const live = trip.sessions.filter((s) => s.session.status === "live");
  const rows = tonightBoard(closed, live, localClock, now);
  const inPlayTotal = rows.reduce((sum, r) => sum + r.inPlay, 0);
  const row = useReorder();
  const tonight = localClock.night(now);
  const others = trip.sessions.some(
    (s) =>
      s.session.id !== sessionId &&
      (s.session.status === "live" || localClock.night(s.session.startedAt) === tonight),
  );
  if (!others || rows.length === 0) return null;

  return (
    <Section
      title="Tonight"
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
