import type { GroupDetail, PlayerId, SessionId } from "@stacks/contracts";
import {
  around,
  barTrack,
  labelWidth,
  lineScale,
  placeLabel,
  spreadLabels,
} from "@stacks/client-runtime/chart";
import { formatDay, playerNames } from "@stacks/client-runtime/format";
import { boardMoney, chipOf, returnLabel } from "@stacks/client-runtime/trip";
import {
  raceLines,
  runningTotals,
  statSheet,
  type RaceMeasure,
  type StatsSession,
} from "@stacks/shared/stats";
import * as DateTime from "effect/DateTime";
import { useState, type Ref } from "react";

import { Money } from "~/components/Money";
import { Note } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { List, Row, RowText, Surface } from "~/components/ui/Surface";
import { cn } from "~/components/ui/cn";
import { useWidth } from "~/lib/useWidth";
import { Chip } from "./Chip";

/** A closed session as the race sees it, oldest first. */
type RaceSession = StatsSession & {
  readonly session: { readonly id: SessionId; readonly startedAt: DateTime.Utc };
};
/** Where on the axis a stretch of sessions starts, such as a night or a trip. */
type Mark = { readonly index: number; readonly label: string };

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
      <PlayerSheet
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

const measures = [
  { value: "money", label: "Money" },
  { value: "return", label: "% of buy-in" },
] as const;
const HEIGHT = 168;
const PAD = { x: 16, y: 14 };
/** Room past the furthest point for each line's initial, and below the plot for the day marks. */
const LABEL = 30;
const MARKS = 22;
const MARK_FONT = 12;
const LETTER = 12;
/** Clear of the card edge, so a rounded clip can't take the first character. */
const INSET = 8;

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
  const [measure, setMeasure] = useState<RaceMeasure>("money");
  const [box, width] = useWidth<HTMLDivElement>();

  const lines = raceLines(
    sessions,
    players.map((p) => p.playerId),
    measure,
  ).map((line, i) => ({ ...line, ...players[i]! }));
  const pickedIndex = lines.findIndex((l) => l.playerId === picked);
  const plot = lineScale(
    lines.map((l) => l.line),
    { width: Math.max(0, width - LABEL), height: HEIGHT },
    PAD,
    around(pickedIndex, lines.length),
  );
  const reading = (value: number | null) =>
    measure === "money" ? boardMoney(value ?? 0, currency) : returnLabel(value);
  const standing = lines
    .map((l) => ({ ...l, now: l.values[at]! }))
    .toSorted((a, b) => (b.now ?? -Infinity) - (a.now ?? -Infinity));
  const [leader, second] = standing;
  const session = sessions[at]!;
  // Yours draws last, on top of everyone else's.
  const drawn = lines.toSorted(
    (a, b) => Number(a.playerId === picked) - Number(b.playerId === picked),
  );
  const point = at + 1;
  const labels = spreadLabels(
    drawn.map(({ line }) => plot.y(line[point]!)),
    LETTER + 6,
    { min: LETTER, max: HEIGHT - LETTER },
  );
  const edges = { min: INSET, max: Math.max(INSET, width - INSET) };

  const scrub = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const fraction = (clientX - rect.left - PAD.x) / (rect.width - LABEL - 2 * PAD.x);
    setAt(Math.max(0, Math.min(last, Math.round(fraction * (last + 1)) - 1)));
  };

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {!second ? (
            `${leader!.name} leads`
          ) : leader!.now === second.now ? (
            `${leader!.name} and ${second.name} are tied`
          ) : measure === "money" ? (
            <>
              {leader!.name} leads by{" "}
              <span className="text-win tabular-nums">
                {boardMoney(leader!.now! - second.now!, currency, false)}
              </span>
            </>
          ) : (
            <>
              {leader!.name} leads at{" "}
              <span className="text-win tabular-nums">{returnLabel(leader!.now)}</span>
            </>
          )}
        </h2>
        <Note className="tabular-nums">
          After session {at + 1} of {sessions.length} · {where(session)} · {session.venue.name},{" "}
          {formatDay(session.session.startedAt)}
        </Note>
      </header>
      <Segmented label="Measure" options={measures} value={measure} onChange={setMeasure} />

      <Surface>
        <div
          ref={box}
          aria-hidden
          className="relative cursor-ew-resize touch-pan-y select-none"
          style={{ height: HEIGHT + MARKS }}
          onPointerDown={(event) => scrub(event.clientX)}
          onPointerMove={(event) =>
            event.pointerType === "mouse" || event.buttons ? scrub(event.clientX) : undefined
          }
        >
          {width > 0 ? (
            <svg width={width} height={HEIGHT + MARKS} className="block overflow-visible">
              <line
                x1={0}
                x2={width - LABEL}
                y1={plot.zero}
                y2={plot.zero}
                stroke="var(--color-line-strong)"
                strokeDasharray="3 4"
              />
              {marks.map((mark) => {
                const place = placeLabel(
                  plot.x(mark.index + 1),
                  labelWidth(mark.label, MARK_FONT),
                  edges,
                );
                return (
                  <text
                    key={mark.index}
                    x={place.x}
                    y={HEIGHT + MARKS - 8}
                    textAnchor={place.anchor}
                    className="fill-muted text-xs"
                  >
                    {mark.label}
                  </text>
                );
              })}
              <line
                x1={plot.x(point)}
                x2={plot.x(point)}
                y1={PAD.y / 2}
                y2={HEIGHT - PAD.y / 2}
                stroke="var(--color-line-strong)"
              />
              {drawn.map(({ playerId, name, line, values }, i) => {
                const yours = playerId === picked;
                const color = yours ? "var(--color-accent)" : "var(--color-muted)";
                const points = line.map((v, i) => `${plot.x(i)},${plot.y(v)}`);
                const now = { x: plot.x(point), y: plot.y(line[point]!) };
                const off = plot.clipped(line[point]!);
                const initial =
                  name.slice(0, 1).toUpperCase() + (off === 1 ? " ↑" : off === -1 ? " ↓" : "");
                const seatWidth = labelWidth(initial, LETTER);
                const seat = placeLabel(now.x + 9 + seatWidth / 2, seatWidth, edges);
                return (
                  <g key={playerId}>
                    <polyline
                      points={points.slice(point).join(" ")}
                      fill="none"
                      stroke={color}
                      strokeOpacity={0.15}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                    <polyline
                      points={points.slice(0, point + 1).join(" ")}
                      fill="none"
                      stroke={color}
                      strokeOpacity={yours ? 1 : 0.45}
                      strokeWidth={yours ? 3 : 2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {yours ? (
                      <circle cx={now.x} cy={now.y} r={10} fill={color} fillOpacity={0.2} />
                    ) : null}
                    <circle cx={now.x} cy={now.y} r={yours ? 4.5 : 3} fill={color} />
                    <text
                      x={seat.x}
                      y={labels[i]}
                      textAnchor={seat.anchor}
                      dominantBaseline="central"
                      className={
                        yours ? "fill-accent-text text-xs font-semibold" : "fill-muted text-xs"
                      }
                    >
                      {initial}
                    </text>
                    <title>{`${name}: ${reading(values[at]!)}`}</title>
                  </g>
                );
              })}
            </svg>
          ) : null}
        </div>
      </Surface>
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
                <RowText title={p.name} />
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    p.now === null || p.now === 0
                      ? "text-muted"
                      : p.now > 0
                        ? "text-win"
                        : "text-loss",
                  )}
                >
                  {reading(p.now)}
                </span>
              </Row>
            </button>
          </li>
        ))}
      </List>
    </section>
  );
}

/** One player's numbers over these sessions: how often they won, their best and worst, every result. */
export function PlayerSheet({
  ref,
  sessions,
  player,
  rank,
  of,
  currency,
}: {
  ref?: Ref<HTMLElement>;
  sessions: ReadonlyArray<RaceSession>;
  player: Pick<Line, "playerId" | "name" | "chip">;
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
      title: "Personal best casino",
      meta: sheet.bestVenue
        ? `${sheet.bestVenue.name} · ${sheet.bestVenue.sessions} ${sheet.bestVenue.sessions === 1 ? "session" : "sessions"}`
        : "Still looking",
      value: sheet.bestVenue ? figure(sheet.bestVenue.net) : none,
    },
    {
      title: "Average buy-in",
      meta: "Per session",
      value: sheet.averageBuyIn === null ? none : figure(sheet.averageBuyIn, true),
    },
  ];
  const focus = shown === null ? null : sheet.played[shown]!;

  return (
    <section
      ref={ref}
      aria-label={`${player.name}'s numbers`}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <header className="flex items-center gap-3">
        <Chip chip={player.chip} name={player.name} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-lg font-semibold wrap-anywhere">{player.name}'s numbers</h2>
          <Note className="tabular-nums">
            #{rank} of {of} · {runs.sessions} {runs.sessions === 1 ? "session" : "sessions"}
          </Note>
        </div>
        <Money
          amount={sheet.total}
          currency={currency}
          tone="result"
          className="text-2xl font-semibold"
        />
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
              : "Pick a bar"}
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
