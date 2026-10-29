import type { CurrencyCode, GroupStats } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { formatDay, runsLine, winRate } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import { runningNet, sessionRuns, type Subject } from "@stacks/shared/results";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Money } from "~/components/Money";
import { cn } from "~/components/ui/cn";

// How far a finger moves before a touch counts as a scroll rather than a tap.
const SLOP = 8;

/** A player's or the group's result in each closed session, oldest on the left, with streaks underneath. */
export function SessionBars({
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
  const touch = useRef<{ x: number; y: number } | null>(null);
  const points = runningNet(stats.bySession, subject);
  if (points.length === 0) {
    return <p className="text-sm text-muted">Each finished session shows up here as a bar.</p>;
  }

  const runs = sessionRuns(points.map((point) => point.net));
  const rate = winRate(runs);
  const track = barTrack(points.map((point) => point.net));
  const shown = active === null ? null : points[active]!;

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - box.left) / box.width) * points.length);
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
            ? `${formatDay(shown.session.startedAt)} · ${formatMoney(shown.total, currency, { signDisplay: "exceptZero" })} overall after it`
            : rate.count}
        </span>
        {shown ? (
          <Money
            amount={shown.net}
            currency={currency}
            tone="result"
            className="text-2xl font-bold"
          />
        ) : (
          <span className="font-mono text-2xl font-bold tabular-nums">
            {rate.percent}
            <span className="font-sans text-base font-normal text-muted"> winning sessions</span>
          </span>
        )}
      </figcaption>

      <div
        role="group"
        tabIndex={0}
        aria-label={`${whose} result in each session. Use the arrow keys to step through them.`}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") return pick(event);
          touch.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => (event.pointerType === "mouse" ? pick(event) : undefined)}
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
        className="relative flex h-40 touch-pan-y gap-px rounded-md outline-offset-4 sm:gap-0.5"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 h-px bg-line-strong"
          style={{ top: `${(1 - track.zero) * 100}%` }}
        />
        {points.map((point, index) => {
          const height = `max(${track.extent(point.net) * 100}%, 2px)`;
          const zero = `${track.zero * 100}%`;
          return (
            <div key={point.session.sessionId} aria-hidden className="relative flex-1">
              <div
                className={cn(
                  "absolute inset-x-0 rounded-[2px]",
                  point.net >= 0 ? "bg-win" : "bg-loss",
                  active !== null && active !== index && "opacity-35",
                )}
                style={
                  point.net >= 0
                    ? { bottom: zero, height }
                    : { top: `${(1 - track.zero) * 100}%`, height }
                }
              />
            </div>
          );
        })}
      </div>

      <p className="text-sm text-muted tabular-nums">{runsLine(runs)}</p>
    </figure>
  );
}
