import type { CurrencyCode, PlayerId } from "@stacks/contracts";
import { lineScale } from "@stacks/client-runtime/chart";
import { localClock, ordinal, tripLines } from "@stacks/client-runtime/trip";
import { playerTrip, tripNights, tripStandings, type TripSession } from "@stacks/shared/trips";
import type { ReactNode } from "react";

import { Money } from "~/components/Money";
import { Glow, Surface } from "~/components/ui/Surface";
import { useWidth } from "~/lib/useWidth";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Your result at a glance, for a trip or all time: where you stand, the line you drew getting there, and how it went. */
export function TripHero({
  currency,
  me,
  sessions: closed,
  label = "Your trip",
  span,
}: {
  currency: CurrencyCode;
  /** Whose result this is. */
  me: PlayerId;
  /** Closed sessions, in any order. */
  sessions: ReadonlyArray<TripSession>;
  label?: string;
  /** What the sessions cover after their count, like "2 nights"; nights by default. */
  span?: string;
}) {
  const mine = playerTrip(closed, me);
  if (mine.played === 0) return null;
  const standings = tripStandings(closed, localClock);
  const rank = standings.find((s) => s.playerId === me)?.rank;
  const lines = tripLines(mine, currency);
  const tone = mine.net > 0 ? "win" : mine.net < 0 ? "loss" : "accent";

  return (
    <Surface className="relative overflow-hidden">
      <Glow tone={tone} />
      <div className="relative flex flex-col px-4 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 text-sm font-medium text-muted">{label}</h2>
          <span className="shrink-0 text-sm text-muted tabular-nums">
            {plural(mine.played, "session")} ·{" "}
            {span ?? plural(tripNights(closed, localClock).length, "night")}
          </span>
        </div>
        <Money
          amount={mine.net}
          currency={currency}
          tone="result"
          className="mt-2 font-display text-5xl leading-none tracking-[-0.01em] sm:text-6xl"
        />
        {lines.climb ? <p className="mt-1.5 text-sm text-muted">{lines.climb}</p> : null}
      </div>
      <TripLine line={mine.line} tone={tone} />
      <dl className="relative flex divide-x divide-line border-t border-line">
        <Tile label="Win rate">{lines.winRate}</Tile>
        <Tile label="Best">
          {mine.best ? <Money amount={mine.best.net} currency={currency} tone="result" /> : "–"}
        </Tile>
        <Tile label="Board">
          {rank === undefined ? (
            "–"
          ) : (
            <span>
              {ordinal(rank)} <span className="font-normal text-muted">of {standings.length}</span>
            </span>
          )}
        </Tile>
      </dl>
    </Surface>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-auto flex-col gap-0.5 px-4 py-3">
      <dt className="text-sm whitespace-nowrap text-muted">{label}</dt>
      <dd className="text-lg font-semibold whitespace-nowrap tabular-nums">{children}</dd>
    </div>
  );
}

const HEIGHT = 96;

/** The running total as a line from zero, filled to break-even, ending on a dot. */
function TripLine({
  line,
  tone,
}: {
  line: ReadonlyArray<number>;
  tone: "win" | "loss" | "accent";
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const plot = lineScale([line], { width, height: HEIGHT }, { x: 16, y: 10 });
  const points = plot.points(line);
  const end = { x: plot.x(line.length - 1), y: plot.y(line.at(-1)!) };
  const color = `var(--color-${tone})`;

  return (
    <div ref={box} aria-hidden className="relative mt-3" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg width={width} height={HEIGHT} className="block overflow-visible select-none">
          <defs>
            <linearGradient id="trip-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.28} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <line
            x1={0}
            x2={width}
            y1={plot.zero}
            y2={plot.zero}
            stroke="var(--color-line-strong)"
            strokeDasharray="3 4"
          />
          <polygon
            points={`${plot.x(0)},${plot.zero} ${points} ${end.x},${plot.zero}`}
            fill="url(#trip-fill)"
          />
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={end.x} cy={end.y} r={10} fill={color} fillOpacity={0.2} />
          <circle cx={end.x} cy={end.y} r={4.5} fill={color} />
        </svg>
      ) : null}
    </div>
  );
}
