import { useAtomValue } from "@effect/atom-react";
import { Link, useLocation } from "@tanstack/react-router";
import { formatTime } from "@stacks/client-runtime/format";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { ChevronRight } from "lucide-react";

import { useStacks } from "~/lib/stacks";

/**
 * The table you're seated at, pinned to the bottom of every page that isn't showing it, so a
 * live session never goes missing.
 */
export function LiveBar() {
  const stacks = useStacks();
  const { pathname } = useLocation();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.flatMap((item) => (item.mySession ? [item.mySession] : []))[0];
  if (!seat) return null;
  const onIt = [`/trips/${seat.tripId}`, `/trips/${seat.tripId}/`, `/sessions/${seat.id}`];
  if (onIt.includes(pathname)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        to="/trips/$tripId"
        params={{ tripId: seat.tripId }}
        className="pointer-events-auto mx-auto flex min-h-13 w-full max-w-2xl items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_var(--color-line-strong),0_8px_24px_-8px_rgb(0_0_0/0.4)] hover:bg-sunken"
      >
        <span
          aria-hidden
          className="size-2 animate-pulse rounded-full bg-live motion-reduce:animate-none"
        />
        <span className="font-mono text-[11px] tracking-[0.08em] text-live uppercase">Live</span>
        <span className="min-w-0 flex-1 truncate font-medium">{seat.venueName}</span>
        <span className="font-mono text-xs text-muted">since {formatTime(seat.startedAt)}</span>
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </Link>
    </div>
  );
}
