import type { GroupDetail, TripDetail } from "@stacks/contracts";
import {
  around,
  labelWidth,
  lineScale,
  placeLabel,
  spreadLabels,
} from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { localClock, raceHeadline } from "@stacks/client-runtime/trip";
import { runningTotals } from "@stacks/shared/stats";
import { tripStandings } from "@stacks/shared/trips";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";
import { Glow, Surface } from "~/components/ui/Surface";
import { useWidth } from "~/lib/useWidth";

const HEIGHT = 128;
const PAD = { x: 16, y: 12 };
/** Room past the last point for each line's initial. */
const LABEL = 30;
const LETTER = 12;
const INSET = 8;

/** The trip as a race, led by your gap to the next player, with everyone's running totals and yours in gold. */
export function RaceHero({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const me = detail.myPlayerId;
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const head = raceHeadline(standings, me, names, currency);
  const [box, width] = useWidth<HTMLDivElement>();
  if (!head || closed.length === 0) return null;

  const lines = standings
    .toSorted((a, b) => a.rank - b.rank)
    .map((s) => ({ playerId: s.playerId, line: [0, ...runningTotals(closed, s.playerId)] }));
  const plot = lineScale(
    lines.map((l) => l.line),
    { width: Math.max(0, width - LABEL), height: HEIGHT },
    PAD,
    around(
      lines.findIndex((l) => l.playerId === me),
      lines.length,
    ),
  );
  // Yours draws last, on top of everyone else's.
  const drawn = lines.toSorted((a, b) => Number(a.playerId === me) - Number(b.playerId === me));
  const labels = spreadLabels(
    drawn.map(({ line }) => plot.y(line.at(-1)!)),
    LETTER + 6,
    { min: LETTER, max: HEIGHT - LETTER },
  );
  const edges = { min: INSET, max: Math.max(INSET, width - INSET) };

  return (
    <Surface className="relative overflow-hidden">
      <Glow tone={head.tone} />
      <div className="relative flex flex-col px-4 pt-4">
        <h2 className="text-sm font-medium text-muted">{head.label}</h2>
        <Money
          amount={head.gap ?? head.net}
          currency={currency}
          tone={head.gap === null ? "result" : "plain"}
          className={cn(
            head.tone === "win" && "text-win",
            head.tone === "loss" && "text-loss",
            "mt-2 font-display text-5xl leading-none tracking-[-0.01em] sm:text-6xl",
          )}
        />
        {head.line ? <p className="mt-1.5 text-sm text-muted">{head.line}</p> : null}
      </div>
      <div ref={box} aria-hidden className="relative mt-3 mb-4" style={{ height: HEIGHT }}>
        {width > 0 ? (
          <svg width={width} height={HEIGHT} className="block overflow-visible select-none">
            <line
              x1={0}
              x2={width - LABEL}
              y1={plot.zero}
              y2={plot.zero}
              stroke="var(--color-line-strong)"
              strokeDasharray="3 4"
            />
            {drawn.map(({ playerId, line }, i) => {
              const yours = playerId === me;
              const end = { x: plot.x(line.length - 1), y: plot.y(line.at(-1)!) };
              const off = plot.clipped(line.at(-1)!);
              const color = yours ? "var(--color-accent)" : "var(--color-muted)";
              const initial =
                (names.get(playerId) ?? "?").slice(0, 1).toUpperCase() +
                (off === 1 ? " ↑" : off === -1 ? " ↓" : "");
              const seatWidth = labelWidth(initial, LETTER);
              const seat = placeLabel(end.x + 9 + seatWidth / 2, seatWidth, edges);
              return (
                <g key={playerId}>
                  <polyline
                    points={plot.points(line)}
                    fill="none"
                    stroke={color}
                    strokeOpacity={yours ? 1 : 0.45}
                    strokeWidth={yours ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {yours ? (
                    <circle cx={end.x} cy={end.y} r={10} fill={color} fillOpacity={0.2} />
                  ) : null}
                  <circle cx={end.x} cy={end.y} r={yours ? 4.5 : 3} fill={color} />
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
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </Surface>
  );
}
