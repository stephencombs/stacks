import type { GroupDetail, TripDetail } from "@stacks/contracts";
import { lineScale } from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { localClock, raceHeadline } from "@stacks/client-runtime/trip";
import { runningTotals } from "@stacks/shared/stats";
import { tripStandings } from "@stacks/shared/trips";

import { Money } from "~/components/Money";
import { Glow, Surface } from "~/components/ui/Surface";
import { useWidth } from "~/lib/useWidth";

const HEIGHT = 128;
const PAD = { x: 12, y: 12 };
/** Room past the last point for each line's initial. */
const LABEL = 18;

/** The trip as a race: everyone's running total session by session, with yours drawn in gold. */
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
  );
  // Yours draws last, on top of everyone else's.
  const drawn = lines.toSorted((a, b) => Number(a.playerId === me) - Number(b.playerId === me));

  return (
    <Surface className="relative overflow-hidden">
      <Glow tone="accent" />
      <div className="relative flex flex-col gap-1 px-5 pt-5">
        <h2 className="text-xs font-medium tracking-wider text-accent-text uppercase">
          {head.label}
        </h2>
        <Money
          amount={head.net}
          currency={currency}
          tone="result"
          className="font-display text-5xl leading-none tracking-[-0.01em] sm:text-6xl"
        />
        {head.line ? <p className="text-sm text-muted">{head.line}</p> : null}
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
            {drawn.map(({ playerId, line }) => {
              const yours = playerId === me;
              const end = { x: plot.x(line.length - 1), y: plot.y(line.at(-1)!) };
              const color = yours ? "var(--color-accent)" : "var(--color-muted)";
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
                    x={end.x + 9}
                    y={end.y}
                    dominantBaseline="central"
                    className={
                      yours ? "fill-accent-text text-xs font-semibold" : "fill-muted text-xs"
                    }
                  >
                    {(names.get(playerId) ?? "?").slice(0, 1).toUpperCase()}
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
