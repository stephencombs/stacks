import { useAtomValue } from "@effect/atom-react";
import { Link, useLocation } from "@tanstack/react-router";
import { formatTime } from "@stacks/client-runtime/format";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { ChevronRight } from "lucide-react";

import { Tag } from "~/components/ui/Surface";
import { useStacks } from "~/lib/stacks";

/**
 * The table you're seated at, floating just above the bottom bar on narrow screens, so a live
 * session never goes missing. Wide screens carry it in the sidebar instead.
 */
export function LiveBar({ inline = false }: { inline?: boolean }) {
  const stacks = useStacks();
  const { pathname } = useLocation();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.flatMap((item) => (item.mySession ? [item.mySession] : []))[0];
  if (!seat) return null;
  if (!inline && /^\/trips\/[^/]+\/(sessions\/new|settle)\/?$/.test(pathname)) return null;
  // The session itself, and its trip's Sessions, where the live card comes first, already show it.
  if (
    pathname === `/sessions/${seat.id}` ||
    pathname.replace(/\/$/, "") === `/trips/${seat.tripId}`
  )
    return null;
  return (
    <div
      className={
        inline
          ? "lg:hidden"
          : "pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 pr-[max(1rem,env(safe-area-inset-right))] pb-2 pl-[max(1rem,env(safe-area-inset-left))] lg:hidden"
      }
    >
      <Link
        to="/sessions/$sessionId"
        params={{ sessionId: seat.id }}
        aria-label={`Back to your table at ${seat.venueName}`}
        className="pointer-events-auto mx-auto flex min-h-14 w-full max-w-[40rem] items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-(--elevation-popover) transition-[background-color,scale] duration-150 hover:bg-sunken active:scale-[0.96]"
      >
        <Tag tone="live">Live</Tag>
        <span className="min-w-0 flex-1 truncate font-medium">{seat.venueName}</span>
        <span className="text-sm text-muted tabular-nums">since {formatTime(seat.startedAt)}</span>
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </Link>
    </div>
  );
}
