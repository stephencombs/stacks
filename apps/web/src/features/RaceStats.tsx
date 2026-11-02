import type { GroupDetail, PlayerId, SessionId, TripDetail } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { formatDay, playerNames } from "@stacks/client-runtime/format";
import { boardMoney, chipOf, localClock } from "@stacks/client-runtime/trip";
import { racePlaces, runningTotals, statSheet, type StatsSession } from "@stacks/shared/stats";
import { tripNights } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useLayoutEffect, useRef, useState } from "react";

import { Money } from "~/components/Money";
import { Note } from "~/components/ui/Page";
import { List, Row, RowText, Surface } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { Chip } from "./Chip";

// Chip 4 is near-black, so its line on the board takes the chip's light edge instead.
const lineColor = (chip: number) =>
  chip === 4 ? "var(--color-muted)" : `var(--color-chip-${chip})`;

/** A closed session as the race sees it, oldest first. */
type RaceSession = StatsSession & {
  readonly session: { readonly id: SessionId; readonly startedAt: DateTime.Utc };
};
/** Where on the axis a stretch of sessions starts, such as a night or a trip. */
type Mark = { readonly index: number; readonly label: string };

/** A trip's stats, with the trip's nights along the race. */
export function TripStats({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const nights = tripNights(closed, localClock);
  const nightOf = new Map(
    nights.flatMap((night) => night.sessions.map((s) => [s.session.id, night.number])),
  );
  return (
    <RaceStats
      detail={detail}
      sessions={closed}
      marks={nights.map((night) => ({
        index: closed.indexOf(night.sessions[0]!),
        label: `D${night.number}`,
      }))}
      where={(session) => `Day ${nightOf.get(session.session.id)}`}
      empty="Stats fill in when the trip's first session closes."
    />
  );
}

/** The race for first, session by session, and one player's stat sheet. */
export function RaceStats<S extends RaceSession>({
  detail,
  sessions: closed,
  marks,
  where,
  empty,
}: {
  detail: GroupDetail;
  sessions: ReadonlyArray<S>;
  marks: ReadonlyArray<Mark>;
  /** Where a session sits, like "Day 3", after "After session 12 of 41". */
  where: (session: S) => string;
  empty: string;
}) {
  const names = playerNames(detail);
  const players = detail.players
    .map((player) => ({
      playerId: player.id,
      name: names.get(player.id) ?? player.displayName,
      chip: chipOf(detail, player.id),
      running: runningTotals(closed, player.id),
    }))
    .filter((player) => closed.some((s) => s.results.some((r) => r.playerId === player.playerId)))
    .toSorted((a, b) => b.running.at(-1)! - a.running.at(-1)!);
  const played = players.some((p) => p.playerId === detail.myPlayerId);
  const [picked, setPicked] = useState(played ? detail.myPlayerId : players[0]?.playerId);

  if (players.length === 0) return <Note>{empty}</Note>;

  const player = players.find((p) => p.playerId === picked) ?? players[0]!;
  return (
    <>
      <Race
        sessions={closed}
        players={players}
        currency={detail.group.currency}
        picked={player.playerId}
        onPick={setPicked}
        marks={marks}
        where={where}
      />
      <Sheet
        key={player.playerId}
        sessions={closed}
        player={player}
        rank={players.indexOf(player) + 1}
        of={players.length}
        currency={detail.group.currency}
      />
    </>
  );
}

type Line = { playerId: PlayerId; name: string; chip: number; running: ReadonlyArray<number> };

function Race<S extends RaceSession>({
  sessions,
  players,
  currency,
  picked,
  onPick,
  marks,
  where,
}: {
  sessions: ReadonlyArray<S>;
  players: ReadonlyArray<Line>;
  currency: GroupDetail["group"]["currency"];
  picked: PlayerId;
  onPick: (playerId: PlayerId) => void;
  marks: ReadonlyArray<Mark>;
  where: (session: S) => string;
}) {
  const last = sessions.length - 1;
  // Unpinned, the race follows the latest session, including ones that arrive while it's open.
  const [pinned, setPinned] = useState<number | null>(null);
  const at = pinned === null ? last : Math.min(pinned, last);
  const setAt = (next: number) => setPinned(next >= last ? null : next);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = box.current!;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Places, not dollars: one big winner would flatten everyone else's line.
  const places = racePlaces(
    sessions,
    players.map((p) => p.playerId),
  );
  const height = 40 * Math.max(2, players.length) + 28;
  const pad = { x: 10, top: 12, bottom: 28 };
  const x = (i: number) => pad.x + (i / Math.max(1, last)) * (width - 2 * pad.x);
  const y = (place: number) =>
    pad.top + (place / Math.max(1, players.length - 1)) * (height - pad.top - pad.bottom);
  const standing = players
    .map((p) => ({ ...p, now: p.running[at]! }))
    .toSorted((a, b) => places[at]!.get(a.playerId)! - places[at]!.get(b.playerId)!);
  const [leader, second] = standing;
  const session = sessions[at]!;

  const scrub = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const fraction = (clientX - rect.left - pad.x) / (rect.width - 2 * pad.x);
    setAt(Math.max(0, Math.min(last, Math.round(fraction * last))));
  };

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {!second ? (
            `${leader!.name} leads`
          ) : leader!.now === second.now ? (
            `${leader!.name} and ${second.name} are tied`
          ) : (
            <>
              {leader!.name} leads by{" "}
              <span className="text-win tabular-nums">
                {boardMoney(leader!.now - second.now, currency, false)}
              </span>
            </>
          )}
        </h2>
        <Note>
          After session {at + 1} of {sessions.length} · {where(session)} · {session.venue.name},{" "}
          {formatDay(session.session.startedAt)}
        </Note>
      </header>

      <div
        ref={box}
        aria-hidden
        className="cursor-ew-resize touch-pan-y select-none"
        onPointerDown={(event) => scrub(event.clientX)}
        onPointerMove={(event) =>
          event.pointerType === "mouse" || event.buttons ? scrub(event.clientX) : undefined
        }
      >
        {width > 0 ? (
          <svg width={width} height={height} className="block overflow-visible">
            {players.map((p, place) => (
              <line
                key={p.playerId}
                x1={pad.x}
                x2={width - pad.x}
                y1={y(place)}
                y2={y(place)}
                stroke="var(--color-line)"
                strokeDasharray="2 4"
              />
            ))}
            {marks.map((mark) => (
              <text
                key={mark.index}
                x={x(mark.index)}
                y={height - 8}
                className="fill-muted text-xs"
              >
                {mark.label}
              </text>
            ))}
            {players.toReversed().map((p) => {
              const points = places.map((m, i) => `${x(i)},${y(m.get(p.playerId)!)}`);
              return (
                <g key={p.playerId} stroke={lineColor(p.chip)} fill="none" strokeLinejoin="round">
                  <polyline
                    points={points.slice(at).join(" ")}
                    strokeOpacity={0.18}
                    strokeWidth={2}
                  />
                  <polyline
                    points={points.slice(0, at + 1).join(" ")}
                    strokeWidth={p.playerId === picked ? 4 : 2.5}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
            <line
              x1={x(at)}
              x2={x(at)}
              y1={pad.top - 6}
              y2={height - pad.bottom + 6}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
            />
            {players.map((p) => (
              <circle
                key={p.playerId}
                cx={x(at)}
                cy={y(places[at]!.get(p.playerId)!)}
                r={6}
                fill={lineColor(p.chip)}
                stroke="var(--color-canvas)"
                strokeWidth={2}
              />
            ))}
          </svg>
        ) : (
          <div style={{ height }} />
        )}
      </div>
      <input
        type="range"
        min={0}
        max={last}
        value={at}
        onChange={(event) => setAt(Number(event.target.value))}
        aria-label="Replay session by session"
        aria-valuetext={`Session ${at + 1} of ${sessions.length}, ${session.venue.name}`}
        className="min-h-11 w-full accent-[var(--color-muted)]"
      />

      <List as="ol">
        {standing.map((p, place) => (
          <li key={p.playerId}>
            <button
              type="button"
              aria-pressed={p.playerId === picked}
              onClick={() => onPick(p.playerId)}
              className={cn(
                "block w-full text-left transition-colors duration-150 hover:bg-sunken focus-visible:-outline-offset-2",
                p.playerId === picked && "shadow-[inset_3px_0_0_var(--color-accent)]",
              )}
            >
              <Row as="span">
                <span className="w-4 shrink-0 text-center font-medium text-muted tabular-nums">
                  {place + 1}
                </span>
                <Chip chip={p.chip} name={p.name} size={28} />
                <span
                  aria-hidden
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ background: lineColor(p.chip) }}
                />
                <RowText title={p.name} />
                <Money amount={p.now} currency={currency} tone="result" className="font-semibold" />
              </Row>
            </button>
          </li>
        ))}
      </List>
    </section>
  );
}

function Sheet({
  sessions,
  player,
  rank,
  of,
  currency,
}: {
  sessions: ReadonlyArray<RaceSession>;
  player: Line;
  rank: number;
  of: number;
  currency: GroupDetail["group"]["currency"];
}) {
  const sheet = statSheet(sessions, player.playerId)!;
  const [shown, setShown] = useState<number | null>(null);
  const track = barTrack(sheet.played.map((p) => p.net));
  const money = (n: number, signed = true) => boardMoney(n, currency, signed);
  const { runs } = sheet;
  const figure = (n: number, plain = false) => (
    <Money
      amount={Math.round(n)}
      currency={currency}
      tone={plain ? "plain" : "result"}
      className="font-semibold"
    />
  );
  const none = <span className="text-faint">—</span>;
  const rows = [
    {
      title: "Win rate",
      meta: `Up in ${runs.wins} of ${runs.sessions}`,
      value: (
        <span className="font-semibold tabular-nums">
          {Math.round((runs.wins / runs.sessions) * 100)}%
        </span>
      ),
    },
    {
      title: "Biggest hit",
      meta: sheet.best?.session.venue.name ?? "No winning session yet",
      value: sheet.best ? figure(sheet.best.net) : none,
    },
    {
      title: "Worst beat",
      meta: sheet.worst?.session.venue.name ?? "Never finished down",
      value: sheet.worst ? figure(sheet.worst.net) : none,
    },
    {
      title: "Longest heater",
      meta:
        runs.current.winning && runs.current.length > 1
          ? `On ${runs.current.length} straight now`
          : "Wins in a row",
      value: <span className="font-semibold tabular-nums">{runs.longestWinningRun}</span>,
    },
    {
      title: "Best casino",
      meta: sheet.bestVenue
        ? `${sheet.bestVenue.name} · ${sheet.bestVenue.sessions} ${sheet.bestVenue.sessions === 1 ? "session" : "sessions"}`
        : "Still looking",
      value: sheet.bestVenue ? figure(sheet.bestVenue.net) : none,
    },
    {
      title: "Average buy-in",
      meta: `${sheet.venues} ${sheet.venues === 1 ? "casino" : "casinos"} played`,
      value: sheet.averageBuyIn === null ? none : figure(sheet.averageBuyIn, true),
    },
  ];
  const focus = shown === null ? null : sheet.played[shown]!;

  return (
    <section aria-label={`${player.name}'s stats`} className="flex flex-col gap-3">
      <header className="flex items-center gap-3">
        <Chip chip={player.chip} name={player.name} size={40} />
        <div className="flex min-w-0 flex-col">
          <Note>
            {player.name} · #{rank} of {of} · {runs.sessions}{" "}
            {runs.sessions === 1 ? "session" : "sessions"}
          </Note>
          <Money
            amount={sheet.total}
            currency={currency}
            tone="result"
            className="text-2xl font-semibold"
          />
        </div>
      </header>

      <List>
        {rows.map((row) => (
          <Row key={row.title}>
            <RowText title={row.title} meta={row.meta} />
            {row.value}
          </Row>
        ))}
      </List>

      <div className="flex flex-col gap-2">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="font-semibold">Every session</h3>
          <span aria-live="polite" className="text-sm text-muted tabular-nums wrap-anywhere">
            {focus
              ? `${formatDay(focus.session.session.startedAt)} · ${focus.session.venue.name} · ${money(focus.net)}`
              : "Tap a bar"}
          </span>
        </div>
        <Surface className="overflow-x-auto" onPointerLeave={() => setShown(null)}>
          <div className="relative flex h-36 w-max min-w-full justify-center gap-1 p-3">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-3 h-px bg-line"
              style={{ bottom: `calc(0.75rem + ${track.zero} * (100% - 1.5rem))` }}
            />
            {sheet.played.map((p, i) => (
              <button
                key={p.session.session.id}
                type="button"
                aria-label={`${formatDay(p.session.session.startedAt)}, ${p.session.venue.name}: ${money(p.net)}`}
                onPointerEnter={() => setShown(i)}
                onFocus={() => setShown(i)}
                onClick={() => setShown(i)}
                className="relative w-10 min-w-10 flex-1 focus-visible:outline-offset-0 pointer-coarse:w-11 pointer-coarse:min-w-11"
              >
                <span
                  className={cn(
                    "absolute inset-x-1 rounded-[2px] transition-opacity duration-150",
                    p.net > 0 ? "bg-win" : p.net < 0 ? "bg-loss" : "bg-muted",
                    shown !== null && shown !== i && "opacity-40",
                  )}
                  style={
                    p.net >= 0
                      ? {
                          bottom: `${track.zero * 100}%`,
                          height: `max(2px, ${track.extent(p.net) * 100}%)`,
                        }
                      : {
                          top: `${(1 - track.zero) * 100}%`,
                          height: `max(2px, ${track.extent(p.net) * 100}%)`,
                        }
                  }
                />
              </button>
            ))}
          </div>
        </Surface>
      </div>
    </section>
  );
}
