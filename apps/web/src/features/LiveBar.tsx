import { useAtomValue } from "@effect/atom-react";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { Link, useLocation, useNavigate, type LinkProps } from "@tanstack/react-router";
import { formatTime } from "@stacks/client-runtime/format";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { visitTitle, type RecordedVisit } from "@stacks/client-runtime/recordingView";
import type { VisitId } from "@stacks/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as DateTime from "effect/DateTime";
import { ChevronRight, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { MenuItem, MenuPopup } from "~/components/ui/Menu";
import { Tag } from "~/components/ui/Surface";
import { useAccount } from "~/lib/account";
import { StacksProvider, useStacks } from "~/lib/stacks";
import { tabOf } from "./tabs";

/** Your own live sessions, newest first, leaving out the one on screen. */
export function useLiveSessions(except?: VisitId) {
  const { home } = useRecordingHome();
  return (home?.active ?? []).filter((item) => item.visit.id !== except);
}

/**
 * What you're playing, floating just above the tabs so a live session never goes missing: your own
 * sessions, else, on Crew's pages, your seat at a group's table. Your play, stats and map ask
 * nothing of the network, so they show only your own. Play shows it inline, in its action bar.
 */
export function LiveBar({ inline = false }: { inline?: boolean }) {
  const live = useLiveSessions();
  const { pathname } = useLocation();
  const account = useAccount();
  if (live.length > 0) {
    if (!inline && pathname === "/") return null;
    return (
      <Floating inline={inline}>
        <LiveSessionsBar live={live} />
      </Floating>
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

/**
 * One bar for your live sessions. It goes straight to a single session; with several it names the
 * newest and opens a menu to pick one.
 */
export function LiveSessionsBar({ live }: { live: ReadonlyArray<RecordedVisit> }) {
  const navigate = useNavigate();
  const [newest, ...rest] = live;
  if (!newest) return null;
  const title = visitTitle(newest.table);
  if (rest.length === 0)
    return (
      <Bar
        link={{ to: "/play/$visitId", params: { visitId: newest.visit.id } }}
        label={`Back to your session, ${title}`}
        title={title}
        since={newest.visit.startedAt}
      />
    );
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger aria-label={`${live.length} live sessions`} className={barClass}>
        <BarContent title={title} trailing={`+${rest.length} live`} icon={ChevronUp} />
      </BaseMenu.Trigger>
      <MenuPopup align="center" side="top">
        {live.map((item) => (
          <MenuItem
            key={item.visit.id}
            onClick={() =>
              void navigate({ to: "/play/$visitId", params: { visitId: item.visit.id } })
            }
          >
            <span className="truncate font-medium">{visitTitle(item.table)}</span>
            <span className="shrink-0 text-muted tabular-nums">
              since {formatTime(item.visit.startedAt)}
            </span>
          </MenuItem>
        ))}
      </MenuPopup>
    </BaseMenu.Root>
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
    <Floating inline={inline}>
      <Bar
        link={{ to: "/sessions/$sessionId", params: { sessionId: seat.id } }}
        label={`Back to your table at ${seat.venueName}`}
        title={seat.venueName}
        since={seat.startedAt}
      />
    </Floating>
  );
}

function Floating({ inline, children }: { inline: boolean; children: ReactNode }) {
  if (inline) return children;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 pr-[max(1rem,env(safe-area-inset-right))] pb-2 pl-[max(1rem,env(safe-area-inset-left))] lg:bottom-0 lg:pr-10 lg:pb-6 lg:pl-70">
      <div className="mx-auto flex max-w-[40rem] flex-col">{children}</div>
    </div>
  );
}

const barClass =
  "glass pressable pointer-events-auto flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-ink";

function BarContent({
  title,
  trailing,
  icon: Icon = ChevronRight,
}: {
  title: string;
  trailing: string;
  icon?: typeof ChevronRight;
}) {
  return (
    <>
      <Tag tone="live">Live</Tag>
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      <span className="text-sm text-muted tabular-nums">{trailing}</span>
      <Icon className="size-4 text-muted" aria-hidden />
    </>
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
    <Link {...link} aria-label={label} className={barClass}>
      <BarContent title={title} trailing={`since ${formatTime(since)}`} />
    </Link>
  );
}
