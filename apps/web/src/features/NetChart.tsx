import { MinorUnits, type CurrencyCode, type GroupStats } from "@stacks/contracts";
import { fromTop, netScale } from "@stacks/client-runtime/chart";
import { formatDay } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import { runningNet, type Subject } from "@stacks/shared/results";
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Money } from "~/components/Money";

// The SVG stretches to its box; strokes keep their width through `vector-effect`.
const WIDTH = 600;
const HEIGHT = 200;
// How far a finger moves before a touch counts as a drag rather than a tap.
const SLOP = 8;

/** A player's or the group's running net over the group's closed sessions, oldest on the left. */
export function NetChart({
  stats,
  subject,
  whose,
  currency,
}: {
  stats: GroupStats;
  subject: Subject;
  /** "Your", "Nick's" or "The group's", from `whose` in client-runtime. */
  whose: string;
  currency: CurrencyCode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId();
  // Where a finger went down. A vertical swipe scrolls the page and leaves the chart alone; a tap
  // picks a session and a sideways drag scrubs through them.
  const touch = useRef<{ x: number; y: number; scrubbing: boolean } | null>(null);
  const points = runningNet(stats.bySession, subject);
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted">A running total shows up here after a finished session.</p>
    );
  }

  // The line starts at zero, before the first session.
  const totals = [0, ...points.map((point) => point.total)];
  const scale = netScale(totals);
  const x = (index: number) => (index / (totals.length - 1)) * WIDTH;
  const y = (value: number) => fromTop(value, scale) * HEIGHT;
  const line = totals.map((value, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(value)}`).join(" ");
  const zero = y(0);
  const breakEven = fromTop(0, scale);
  const last = points.at(-1)!;
  const shown = active === null ? null : points[active]!;
  const axis = (value: number) =>
    formatMoney(MinorUnits.make(value), currency, { trailingZeroDisplay: "stripIfInteger" });

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - box.left) / box.width) * (totals.length - 1)) - 1;
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, (current: number) => number> = {
      ArrowLeft: (current) => current - 1,
      ArrowRight: (current) => current + 1,
      Home: () => 0,
      End: () => points.length - 1,
    };
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    setActive((current) =>
      Math.min(points.length - 1, Math.max(0, move(current ?? points.length - 1))),
    );
  };

  return (
    <figure className="flex flex-col gap-4">
      <figcaption aria-live="polite" className="flex min-h-14 flex-col gap-0.5">
        <span className="text-sm text-muted">
          {shown
            ? `${formatDay(shown.session.startedAt)} · ${shown.net >= 0 ? "won" : "lost"} ${formatMoney(MinorUnits.make(Math.abs(shown.net)), currency)}`
            : `After ${points.length} ${points.length === 1 ? "session" : "sessions"}`}
        </span>
        <Money
          amount={(shown ?? last).total}
          currency={currency}
          tone="result"
          className="font-serif text-3xl"
        />
      </figcaption>

      <div className="flex gap-3">
        <div aria-hidden className="relative w-14 shrink-0">
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-xs text-muted tabular-nums"
              style={{ top: `${fromTop(tick, scale) * 100}%` }}
            >
              {axis(tick)}
            </span>
          ))}
        </div>

        <div
          role="group"
          tabIndex={0}
          aria-label={`${whose} net after each session. Use the arrow keys to step through sessions.`}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") return pick(event);
            touch.current = { x: event.clientX, y: event.clientY, scrubbing: false };
          }}
          onPointerMove={(event) => {
            if (event.pointerType !== "touch") return pick(event);
            const start = touch.current;
            if (!start) return;
            const dx = Math.abs(event.clientX - start.x);
            if (!start.scrubbing && (dx < SLOP || dx < Math.abs(event.clientY - start.y))) return;
            start.scrubbing = true;
            pick(event);
          }}
          onPointerUp={(event) => {
            const start = touch.current;
            touch.current = null;
            const moved = start
              ? Math.hypot(event.clientX - start.x, event.clientY - start.y)
              : Infinity;
            if (event.pointerType === "touch" && moved < SLOP) pick(event);
          }}
          // The browser took the gesture over to scroll the page.
          onPointerCancel={() => {
            touch.current = null;
          }}
          onPointerLeave={(event) => (event.pointerType === "mouse" ? setActive(null) : undefined)}
          onKeyDown={step}
          onBlur={() => setActive(null)}
          className="relative h-48 flex-1 touch-pan-y rounded-md outline-offset-4"
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 size-full overflow-visible"
          >
            <defs>
              <linearGradient
                id={gradient}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="0"
                y2={HEIGHT}
              >
                <stop offset={0} stopColor="var(--color-win)" />
                <stop offset={breakEven} stopColor="var(--color-win)" />
                <stop offset={breakEven} stopColor="var(--color-loss)" />
                <stop offset={1} stopColor="var(--color-loss)" />
              </linearGradient>
            </defs>
            {scale.ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={WIDTH}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "var(--color-line-strong)" : "var(--color-line)"}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={`${line} L${WIDTH},${zero} L0,${zero} Z`}
              fill={`url(#${gradient})`}
              fillOpacity={0.12}
            />
            <path
              d={line}
              fill="none"
              stroke={`url(#${gradient})`}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {active === null ? null : (
            <>
              <div
                aria-hidden
                className="absolute inset-y-0 w-px bg-line-strong"
                style={{ left: `${(x(active + 1) / WIDTH) * 100}%` }}
              />
              <div
                aria-hidden
                className="absolute size-2.5 -translate-1/2 rounded-full bg-ink ring-2 ring-surface"
                style={{
                  left: `${(x(active + 1) / WIDTH) * 100}%`,
                  top: `${fromTop(points[active]!.total, scale) * 100}%`,
                }}
              />
            </>
          )}
        </div>
      </div>

      <div aria-hidden className="flex justify-between pl-17 text-xs text-muted">
        <span>{formatDay(points[0]!.session.startedAt)}</span>
        {points.length > 1 ? <span>{formatDay(last.session.startedAt)}</span> : null}
      </div>
    </figure>
  );
}
