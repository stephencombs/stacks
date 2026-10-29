import type { GroupDetail, PlayerId, SessionId, TripDetail } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { formatDay, playerNames } from "@stacks/client-runtime/format";
import { boardMoney, chipOf, localClock } from "@stacks/client-runtime/trip";
import { racePlaces, runningTotals, statSheet, type StatsSession } from "@stacks/shared/stats";
import { tripNights } from "@stacks/shared/trips";
import * as DateTime from "effect/DateTime";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "~/components/ui/cn";
import { Chip } from "./Chip";

// Board readouts: small mono caps, like the labels on a sportsbook screen.
const label = "font-mono text-[11px] tracking-[0.08em] uppercase";
const tone = (n: number) => (n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");
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
      latest={trip.trip.endedAt === null ? "The race so far" : "How it finished"}
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
  latest,
  empty,
}: {
  detail: GroupDetail;
  sessions: ReadonlyArray<S>;
  marks: ReadonlyArray<Mark>;
  /** Where a session sits, like "Day 3", after "After session 12 of 41". */
  where: (session: S) => string;
  /** The heading's lead-in at the latest session. */
  latest: string;
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

  if (players.length === 0) return <p className="text-sm text-muted">{empty}</p>;

  const player = players.find((p) => p.playerId === picked) ?? players[0]!;
  return (
    <div className="flex flex-col gap-8">
      <Race
        sessions={closed}
        players={players}
        currency={detail.group.currency}
        picked={player.playerId}
        onPick={setPicked}
        marks={marks}
        where={where}
        latest={latest}
      />
      <Sheet
        key={player.playerId}
        sessions={closed}
        player={player}
        rank={players.indexOf(player) + 1}
        of={players.length}
        currency={detail.group.currency}
      />
    </div>
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
  latest,
}: {
  sessions: ReadonlyArray<S>;
  players: ReadonlyArray<Line>;
  currency: GroupDetail["group"]["currency"];
  picked: PlayerId;
  onPick: (playerId: PlayerId) => void;
  marks: ReadonlyArray<Mark>;
  where: (session: S) => string;
  latest: string;
}) {
  const last = sessions.length - 1;
  const [at, setAt] = useState(last);
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
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className={cn(label, "text-muted")}>
          {at === last ? latest : `After session ${at + 1} of ${sessions.length}`} ·{" "}
          {where(session)}
        </p>
        <h2 className="font-display text-4xl leading-none tracking-tight uppercase">
          {!second ? (
            `${leader!.name} leads`
          ) : leader!.now === second.now ? (
            `${leader!.name} and ${second.name} are tied`
          ) : (
            <>
              {leader!.name} leads by{" "}
              <span className="font-mono text-win">
                {boardMoney(leader!.now - second.now, currency, false)}
              </span>
            </>
          )}
        </h2>
        <p className="text-sm text-muted">
          Session {at + 1}: {session.venue.name}, {formatDay(session.session.startedAt)}
        </p>
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
                className="fill-muted font-mono text-[10px]"
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
        className="w-full accent-[var(--color-accent)]"
      />

      <ol className="overflow-hidden rounded-xl border border-line bg-surface">
        {standing.map((p, place) => (
          <li key={p.playerId} className="border-t border-line first:border-t-0">
            <button
              type="button"
              aria-pressed={p.playerId === picked}
              onClick={() => onPick(p.playerId)}
              className={cn(
                "grid w-full grid-cols-[1.5rem_auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-sunken/50 focus-visible:-outline-offset-2",
                p.playerId === picked && "shadow-[inset_3px_0_0_var(--color-accent)]",
              )}
            >
              <span className="font-mono text-lg font-bold text-accent-text">{place + 1}</span>
              <Chip chip={p.chip} name={p.name} size={26} />
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ background: lineColor(p.chip) }}
                />
                <span className="truncate font-display text-lg leading-tight tracking-wide uppercase">
                  {p.name}
                </span>
              </span>
              <span className={cn("font-mono text-lg font-bold", tone(p.now))}>
                {boardMoney(p.now, currency)}
              </span>
            </button>
          </li>
        ))}
      </ol>
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
  const tiles = [
    {
      title: "Win rate",
      value: `${Math.round((runs.wins / runs.sessions) * 100)}%`,
      line: `Up in ${runs.wins} of ${runs.sessions}`,
    },
    {
      title: "Biggest hit",
      value: sheet.best ? money(sheet.best.net) : "—",
      line: sheet.best?.session.venue.name ?? "No winning session yet",
      tone: sheet.best?.net,
    },
    {
      title: "Worst beat",
      value: sheet.worst ? money(sheet.worst.net) : "—",
      line: sheet.worst?.session.venue.name ?? "Never finished down",
      tone: sheet.worst?.net,
    },
    {
      title: "Longest heater",
      value: String(runs.longestWinningRun),
      line:
        runs.current.winning && runs.current.length > 1
          ? `On ${runs.current.length} straight now`
          : "Wins in a row",
    },
    {
      title: "Best casino",
      value: sheet.bestVenue ? money(sheet.bestVenue.net) : "—",
      line: sheet.bestVenue
        ? `${sheet.bestVenue.name} · ${sheet.bestVenue.sessions} sess`
        : "Still looking",
      tone: sheet.bestVenue?.net,
    },
    {
      title: "Avg buy-in",
      value: sheet.averageBuyIn === null ? "—" : money(sheet.averageBuyIn, false),
      line: `${sheet.venues} ${sheet.venues === 1 ? "casino" : "casinos"} played`,
    },
  ];
  const focus = shown === null ? null : sheet.played[shown]!;

  return (
    <section aria-label={`${player.name}'s stats`} className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={cn(label, "text-muted")}>
            {player.name} · #{rank} of {of} · {runs.sessions}{" "}
            {runs.sessions === 1 ? "session" : "sessions"}
          </p>
          <p className={cn("font-mono text-5xl font-bold tracking-tight", tone(sheet.total))}>
            {money(sheet.total)}
          </p>
        </div>
        <Chip chip={player.chip} name={player.name} size={56} />
      </header>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((tile) => (
          <li
            key={tile.title}
            className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3"
          >
            <span className={cn(label, "text-muted")}>{tile.title}</span>
            <span
              className={cn(
                "font-mono text-2xl font-bold",
                tile.tone === undefined ? "text-ink" : tone(tile.tone),
              )}
            >
              {tile.value}
            </span>
            <span className="truncate text-xs text-muted">{tile.line}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-semibold">Every session</h3>
          <span aria-live="polite" className="truncate font-mono text-xs text-muted">
            {focus
              ? `${formatDay(focus.session.session.startedAt)} · ${focus.session.venue.name} · ${money(focus.net)}`
              : "Tap a bar"}
          </span>
        </div>
        <div
          className="relative flex h-36 gap-[2px] rounded-xl border border-line bg-surface p-3"
          onPointerLeave={() => setShown(null)}
        >
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
              className="relative min-w-0 flex-1 focus-visible:outline-offset-0"
            >
              <span
                className={cn(
                  "absolute inset-x-0 rounded-[2px] transition-opacity duration-150",
                  p.net >= 0 ? "bg-win" : "bg-loss",
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
      </div>
    </section>
  );
}
