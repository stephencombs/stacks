import { useAtomValue } from "@effect/atom-react";
import { Link, useLocation } from "@tanstack/react-router";
import { formatTime } from "@stacks/client-runtime/format";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { ChevronRight } from "lucide-react";

import { Tag } from "~/components/ui/Surface";
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Link
        to="/trips/$tripId"
        params={{ tripId: seat.tripId }}
        aria-label={`Back to your table at ${seat.venueName}`}
        className="pointer-events-auto mx-auto flex min-h-14 w-full max-w-[40rem] items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-(--elevation-popover) hover:bg-sunken"
      >
        <Tag tone="live">Live</Tag>
        <span className="min-w-0 flex-1 truncate font-medium">{seat.venueName}</span>
        <span className="text-sm text-muted tabular-nums">since {formatTime(seat.startedAt)}</span>
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </Link>
    </div>
  );
}
