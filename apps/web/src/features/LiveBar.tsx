import { useAtomValue } from "@effect/atom-react";
import { Link, useLocation, type LinkProps } from "@tanstack/react-router";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { visitTitle } from "@stacks/client-runtime/recordingView";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as DateTime from "effect/DateTime";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Tag } from "~/components/ui/Surface";
import { useAccount } from "~/lib/account";
import { StacksProvider, useStacks } from "~/lib/stacks";
import { tabOf } from "./tabs";

/**
 * What you're playing, floating just above the tabs so a live session never goes missing: each of
 * your own live sessions, else, on Crew's pages, your seat at a group's table. Your play, stats and
 * map ask nothing of the network, so they show only your own. Play shows it inline, in its own
 * action bar, and a session's page leaves itself out.
 */
export function LiveBar({ inline = false }: { inline?: boolean }) {
  const { home } = useRecordingHome();
  const { pathname } = useLocation();
  const account = useAccount();
  const live = home?.active ?? [];
  if (live.length > 0) {
    if (!inline && pathname === "/") return null;
    const shown = live.filter((item) => pathname !== `/play/${item.visit.id}`);
    if (shown.length === 0) return null;
    return (
      <Bars inline={inline}>
        {shown.map((item) => (
          <Bar
            key={item.visit.id}
            link={{ to: "/play/$visitId", params: { visitId: item.visit.id } }}
            label={`Back to your session, ${visitTitle(item.table)}`}
            title={visitTitle(item.table)}
            since={item.visit.startedAt}
          />
        ))}
      </Bars>
    );
  }
  if (tabOf(pathname) !== "crew" || !account.available || !account.isSignedIn || !account.userId)
    return null;
  return (
    <StacksProvider key={account.userId}>
      <Seat inline={inline} pathname={pathname} />
    </StacksProvider>
  );
}

function Seat({ inline, pathname }: { inline: boolean; pathname: string }) {
  const stacks = useStacks();
  const groups = AsyncResult.getOrElse(useAtomValue(stacks.groups), () => []);
  const seat = groups.flatMap((item) => (item.mySession ? [item.mySession] : []))[0];
  if (!seat) return null;
  if (!inline && /^\/trips\/[^/]+\/sessions\/new\/?$/.test(pathname)) return null;
  // The session itself, and its trip's sessions, where the live card comes first, already show it.
  if (
    pathname === `/sessions/${seat.id}` ||
    pathname.replace(/\/$/, "") === `/trips/${seat.tripId}`
  )
    return null;
  return (
    <Bars inline={inline}>
      <Bar
        link={{ to: "/sessions/$sessionId", params: { sessionId: seat.id } }}
        label={`Back to your table at ${seat.venueName}`}
        title={seat.venueName}
        since={seat.startedAt}
      />
    </Bars>
  );
}

function Bars({ inline, children }: { inline: boolean; children: ReactNode }) {
  return (
    <div
      className={
        inline
          ? undefined
          : "pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 pr-[max(1rem,env(safe-area-inset-right))] pb-2 pl-[max(1rem,env(safe-area-inset-left))] lg:bottom-0 lg:pr-10 lg:pb-6 lg:pl-70"
      }
    >
      <div className={inline ? "flex flex-col gap-2" : "mx-auto flex max-w-[40rem] flex-col gap-2"}>
        {children}
      </div>
    </div>
  );
}

function Bar({
  link,
  label,
  title,
  since,
}: {
  link: LinkProps;
  label: string;
  title: string;
  since: DateTime.Utc;
}) {
  return (
    <Link
      {...link}
      aria-label={label}
      className="glass pressable pointer-events-auto flex min-h-14 items-center gap-3 rounded-xl px-4 py-3"
    >
      <Tag tone="live">Live</Tag>
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      <span className="text-sm text-muted tabular-nums">since {formatTime(since)}</span>
      <ChevronRight className="size-4 text-muted" aria-hidden />
    </Link>
  );
}
