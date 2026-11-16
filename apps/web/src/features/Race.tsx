import type { CurrencyCode, PlayerId } from "@stacks/contracts";
import {
  around,
  labelWidth,
  lineScale,
  placeLabel,
  spreadLabels,
} from "@stacks/client-runtime/chart";
import { formatDay, venueLabel } from "@stacks/client-runtime/format";
import { boardMoney, returnLabel } from "@stacks/client-runtime/trip";
import { raceLines, type RaceMeasure, type StatsSession } from "@stacks/shared/stats";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";

import { Note } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { Surface } from "~/components/ui/Surface";
import { useWidth } from "~/lib/useWidth";

/** A finished session as the race sees it, oldest first. */
type RaceSession = StatsSession & {
  readonly session: { readonly id: string; readonly startedAt: DateTime.Utc };
};
/** Where on the axis a stretch of sessions starts, such as a night or a trip. */
type Mark = { readonly index: number; readonly label: string };

type Line = { readonly playerId: PlayerId; readonly name: string };

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

/**
 * Everyone's running result from break-even, session by session, with a replay. The line you're
 * following is ink; the leader reads out above it.
 */
export function Race<S extends RaceSession>({
  sessions,
  players,
  currency,
  picked,
  marks,
  where,
}: {
  sessions: ReadonlyArray<S>;
  players: ReadonlyArray<Line>;
  currency: CurrencyCode;
  picked: PlayerId;
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
          After session {at + 1} of {sessions.length} · {where(session)} ·{" "}
          {venueLabel(session.venue)}, {formatDay(session.session.startedAt)}
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
                stroke="var(--color-fill-strong)"
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
                stroke="var(--color-fill-strong)"
              />
              {drawn.map(({ playerId, name, line, values }, i) => {
                const yours = playerId === picked;
                const color = yours ? "var(--color-ink)" : "var(--color-muted)";
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
                      className={yours ? "fill-ink text-xs font-semibold" : "fill-muted text-xs"}
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
        aria-valuetext={`Session ${at + 1} of ${sessions.length}, ${venueLabel(session.venue)}`}
        className="min-h-11 w-full accent-[var(--color-muted)]"
      />
    </section>
  );
}
