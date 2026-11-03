import { useClerk, useUser } from "@clerk/react";
import { useAtomValue } from "@effect/atom-react";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import type { GroupListItem, Trip, TripId } from "@stacks/contracts";
import { formatTime } from "@stacks/client-runtime/format";
import { themeChoices } from "@stacks/client-runtime/theme";
import { scopeTrips, tripDates, tripInScope, unsettledAmount } from "@stacks/client-runtime/trip";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { ArrowLeftRight, Check, Layers, Plus, TrendingUp, Users } from "lucide-react";
import { useState, type ReactNode } from "react";

import { BrandMark } from "~/components/BrandMark";
import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { cn } from "~/components/ui/cn";
import { PlaceLink, ScopeButton } from "~/components/ui/Nav";
import { Note, Section } from "~/components/ui/Page";
import { Segmented } from "~/components/ui/Segmented";
import { List, RowLink, RowText, Skeleton, Tag } from "~/components/ui/Surface";
import { Loaded, useLastTrip, useStacks } from "~/lib/stacks";
import { setTheme, useTheme } from "~/lib/theme";
import { CreateGroupDialog } from "./GroupsList";
import { LiveBar } from "./LiveBar";
import { FieldsSkeleton, RowsSkeleton } from "./PageSkeletons";
import { LimitsForm } from "./PersonalLimits";
import { StartTripDialog } from "./Trips";

type Place = "sessions" | "board" | "settle" | "group";

/** Which place a page belongs to. A session is pushed onto Sessions. */
const placeOf = (pathname: string): Place | null =>
  pathname.startsWith("/groups/")
    ? "group"
    : /^\/trips\/[^/]+\/board/.test(pathname)
      ? "board"
      : /^\/trips\/[^/]+\/settle/.test(pathname)
        ? "settle"
        : /^\/(trips|sessions)\//.test(pathname)
          ? "sessions"
          : null;

/**
 * The trip in scope, with its group. A trip's page sets it, and so does your table's session; any
 * other session waits for its page to remember its trip. A group's page keeps the remembered trip
 * if it's in that group, else picks the group's own. Elsewhere, the remembered trip.
 */
function useScope() {
  const stacks = useStacks();
  const result = useAtomValue(stacks.groups);
  const groups = AsyncResult.getOrElse(result, () => []);
  const { lastTripId } = useLastTrip();
  const params: { tripId?: string; groupId?: string; sessionId?: string } = useParams({
    strict: false,
  });
  const seat = groups.flatMap((item) => (item.mySession ? [item.mySession] : []))[0] ?? null;
  const wanted =
    params.tripId ?? (seat && seat.id === params.sessionId ? seat.tripId : null) ?? lastTripId;
  const item = params.groupId
    ? groups.find((group) => group.group.id === params.groupId)
    : (groups.find((group) => group.trips.some((trip) => trip.id === wanted)) ??
      // A trip your groups don't list yet, like one just started, waits for them.
      (params.tripId ? undefined : groups[0]));
  const trip = item
    ? (item.trips.find((trip) => trip.id === wanted) ?? tripInScope(item.trips, lastTripId))
    : undefined;
  return {
    loading: AsyncResult.isInitial(result),
    groups,
    item,
    // Before your groups arrive, a trip's page already says which trip it is.
    tripId: (params.tripId as TripId | undefined) ?? trip?.id,
    trip,
    seat,
  };
}

type Scope = ReturnType<typeof useScope>;

/**
 * Every signed-in page sits in this frame: where you are and the four places, as a top bar and a
 * bottom bar on narrow screens and a sidebar on wide ones, with You behind your avatar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const scope = useScope();
  const place = placeOf(pathname);
  // Sessions is the one page with a rail beside it, once there's room.
  const wide = /^\/trips\/[^/]+\/?$/.test(pathname);
  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30"
      >
        Skip to content
      </a>
      <Sidebar scope={scope} place={place} />
      <div className="pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] lg:pr-10 lg:pl-70">
        <div
          className={cn(
            "mx-auto flex min-h-dvh w-full max-w-2xl flex-col",
            wide && "xl:max-w-[1040px]",
          )}
        >
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 pt-[env(safe-area-inset-top)] box-content lg:hidden">
            {scope.item || scope.loading ? (
              <ScopeControl scope={scope} className="max-w-[70%]" />
            ) : (
              <Wordmark />
            )}
            <You layout="bar" scope={scope} />
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="flex w-full flex-1 flex-col gap-8 pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pt-10 lg:pb-16"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomBar scope={scope} place={place} />
      <LiveBar />
    </>
  );
}

export function Wordmark() {
  return (
    <Link
      to="/"
      className="flex min-h-11 items-center gap-2 font-display text-2xl tracking-wide uppercase"
    >
      <BrandMark className="size-7" />
      Color Up
    </Link>
  );
}

const places = [
  { key: "sessions", label: "Sessions", icon: Layers, to: "/trips/$tripId" },
  { key: "board", label: "Board", icon: TrendingUp, to: "/trips/$tripId/board" },
  { key: "settle", label: "Settle up", icon: ArrowLeftRight, to: "/trips/$tripId/settle" },
] as const;

/** The four places. A group with no trips has only Group until its first trip starts. */
function Places({
  scope,
  place,
  layout,
}: {
  scope: Scope;
  place: Place | null;
  layout: "bar" | "side";
}) {
  const icon = (Icon: typeof Users) => <Icon className="size-5 shrink-0" aria-hidden />;
  const groupId = scope.item?.group.id;
  return (
    <>
      {scope.tripId
        ? places.map((entry) => (
            <PlaceLink
              key={entry.key}
              to={entry.to}
              params={{ tripId: scope.tripId! }}
              icon={icon(entry.icon)}
              label={entry.label}
              current={place === entry.key}
              layout={layout}
            />
          ))
        : null}
      {groupId ? (
        <PlaceLink
          to="/groups/$groupId"
          params={{ groupId }}
          icon={icon(Users)}
          label="Group"
          current={place === "group"}
          layout={layout}
        />
      ) : null}
    </>
  );
}

function BottomBar({ scope, place }: { scope: Scope; place: Place | null }) {
  if (!scope.item && !scope.tripId) return null;
  return (
    <nav
      aria-label="Places"
      className="fixed inset-x-0 bottom-0 z-20 flex bg-surface pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-1px_0_var(--color-line)] lg:hidden"
    >
      <Places scope={scope} place={place} layout="bar" />
    </nav>
  );
}

function Sidebar({ scope, place }: { scope: Scope; place: Place | null }) {
  const { item, trip, seat } = scope;
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-5 border-r border-line bg-canvas px-3 pb-3 lg:flex">
      <div className="flex h-16 shrink-0 items-center px-2">
        <Wordmark />
      </div>
      {item || scope.loading ? <ScopeControl scope={scope} className="w-full" /> : null}
      <nav aria-label="Places" className="flex flex-col gap-0.5">
        <Places scope={scope} place={place} layout="side" />
      </nav>
      {seat ? (
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: seat.id }}
          aria-label={`Back to your table at ${seat.venueName}`}
          className="flex flex-col gap-1.5 rounded-xl bg-surface p-3 shadow-(--elevation-card) transition-colors duration-150 hover:bg-sunken"
        >
          <span className="flex items-center justify-between gap-2">
            <Tag tone="live">Live</Tag>
            <span className="text-xs text-muted tabular-nums">
              since {formatTime(seat.startedAt)}
            </span>
          </span>
          <span className="truncate font-medium">{seat.venueName}</span>
        </Link>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {item && item.trips.length > 0 ? (
          <>
            <h2 className="px-3 pb-1 text-xs font-medium text-muted">Trips</h2>
            {scopeTrips(item.trips).map((other) => (
              <Link
                key={other.id}
                to="/trips/$tripId"
                params={{ tripId: other.id }}
                className={cn(
                  "flex min-h-9 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-sunken hover:text-ink",
                  other.id === trip?.id ? "font-medium text-ink" : "text-muted",
                )}
              >
                <span className="truncate">{other.name}</span>
                {seat?.tripId === other.id ? <Tag tone="live">Live</Tag> : null}
              </Link>
            ))}
          </>
        ) : null}
      </div>
      <You layout="side" scope={scope} />
    </aside>
  );
}

/** The scope button and the sheet it opens: this group's trips, the group, and your other groups. */
function ScopeControl({ scope, className }: { scope: Scope; className?: string }) {
  const stacks = useStacks();
  const [open, setOpen] = useState<"scope" | "trip" | "group" | null>(null);
  const { item, trip } = scope;
  if (!item) return <Skeleton className={cn("h-11 w-40 rounded-lg", className)} />;
  return (
    <>
      <ScopeButton
        context={trip ? item.group.name : undefined}
        label={trip?.name ?? item.group.name}
        aria-label={trip ? `${item.group.name}, ${trip.name}: switch trips` : item.group.name}
        aria-haspopup="dialog"
        onClick={() => setOpen("scope")}
        className={className}
      />
      <Dialog
        open={open === "scope"}
        onOpenChange={(next) => setOpen(next ? "scope" : null)}
        title={item.group.name}
      >
        <ScopeSheet
          scope={scope}
          item={item}
          onClose={() => setOpen(null)}
          onNewTrip={() => setOpen("trip")}
          onNewGroup={() => setOpen("group")}
        />
      </Dialog>
      {open === "trip" ? (
        <Loaded query={stacks.group(item.group.id)} skeleton={null}>
          {(detail) => <StartTripDialog detail={detail} onClose={() => setOpen(null)} />}
        </Loaded>
      ) : null}
      <CreateGroupDialog
        open={open === "group"}
        onOpenChange={(next) => setOpen(next ? "group" : null)}
      />
    </>
  );
}

function ScopeSheet({
  scope,
  item,
  onClose,
  onNewTrip,
  onNewGroup,
}: {
  scope: Scope;
  item: GroupListItem;
  onClose: () => void;
  onNewTrip: () => void;
  onNewGroup: () => void;
}) {
  const stacks = useStacks();
  const others = scope.groups.filter((other) => other.group.id !== item.group.id);
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Trips"
        action={
          <Button size="sm" variant="ghost" onClick={onNewTrip}>
            <Plus className="size-4" aria-hidden />
            New trip
          </Button>
        }
      >
        {item.trips.length === 0 ? (
          <Note>No trips yet. Start one, and its sessions, board and settle up open here.</Note>
        ) : (
          <Loaded
            query={stacks.group(item.group.id)}
            skeleton={<RowsSkeleton rows={Math.min(item.trips.length, 6)} trailing={false} />}
          >
            {(detail) => (
              <List>
                {scopeTrips(detail.trips).map((trip) => (
                  <ScopeTripRow
                    key={trip.id}
                    trip={trip}
                    current={trip.id === scope.trip?.id}
                    live={item.mySession?.tripId === trip.id}
                    left={unsettledAmount(detail, trip.id)}
                    currency={item.group.currency}
                    onClose={onClose}
                  />
                ))}
              </List>
            )}
          </Loaded>
        )}
      </Section>
      <List>
        <RowLink to="/groups/$groupId" params={{ groupId: item.group.id }} onClick={onClose}>
          <RowText title={`Open ${item.group.name}`} meta="Every trip, its people and settings" />
        </RowLink>
      </List>
      {others.length > 0 ? (
        <Section title="Your other groups">
          <List>
            {others.map((other) => {
              const next = tripInScope(other.trips, null);
              const text = (
                <RowText title={other.group.name} meta={next ? next.name : "No trips yet"} />
              );
              return next ? (
                <RowLink
                  key={other.group.id}
                  to="/trips/$tripId"
                  params={{ tripId: next.id }}
                  onClick={onClose}
                >
                  {text}
                  {other.mySession ? <Tag tone="live">Live</Tag> : null}
                </RowLink>
              ) : (
                <RowLink
                  key={other.group.id}
                  to="/groups/$groupId"
                  params={{ groupId: other.group.id }}
                  onClick={onClose}
                >
                  {text}
                </RowLink>
              );
            })}
          </List>
        </Section>
      ) : null}
      <Button variant="ghost" className="self-start" onClick={onNewGroup}>
        <Plus className="size-4" aria-hidden />
        New group
      </Button>
    </div>
  );
}

function ScopeTripRow({
  trip,
  current,
  live,
  left,
  currency,
  onClose,
}: {
  trip: Trip;
  current: boolean;
  live: boolean;
  left: ReturnType<typeof unsettledAmount>;
  currency: GroupListItem["group"]["currency"];
  onClose: () => void;
}) {
  return (
    <RowLink
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      onClick={onClose}
      {...(current ? { "aria-current": "page" as const } : {})}
    >
      <RowText
        title={trip.name}
        meta={
          <>
            {tripDates(trip)}
            {left !== null ? (
              <>
                {" · "}
                <Money amount={left} currency={currency} /> to settle
              </>
            ) : null}
          </>
        }
      />
      {live ? <Tag tone="live">Live</Tag> : trip.endedAt !== null ? <Tag>Ended</Tag> : null}
      {current ? <Check className="size-4 shrink-0 text-accent-text" aria-hidden /> : null}
    </RowLink>
  );
}

/** Your avatar, and behind it everything that's only about you: limits, appearance, account. */
export function You({ layout, scope }: { layout: "bar" | "side"; scope?: Scope }) {
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const clerk = useClerk();
  const theme = useTheme();
  const stacks = useStacks();
  const trip = scope?.trip;
  const avatar = (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-fill text-sm font-semibold">
      {user?.imageUrl ? (
        <img src={user.imageUrl} alt="" className="size-full object-cover" />
      ) : (
        (user?.firstName ?? "?").slice(0, 1)
      )}
    </span>
  );
  return (
    <>
      {layout === "bar" ? (
        <button
          type="button"
          aria-label="You"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="-mr-1.5 inline-grid size-11 shrink-0 place-items-center rounded-full transition-[scale] duration-150 active:scale-[0.96]"
        >
          {avatar}
        </button>
      ) : (
        <button
          type="button"
          aria-label="You"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          className="flex h-12 shrink-0 items-center gap-3 rounded-lg px-2 text-left text-sm transition-colors duration-150 hover:bg-sunken"
        >
          {avatar}
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">You</span>
            {user?.fullName ? (
              <span className="truncate text-xs text-muted">{user.fullName}</span>
            ) : null}
          </span>
        </button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="You"
        description={user?.fullName ?? undefined}
      >
        <div className="flex flex-col gap-6">
          <Section title="Play limits" aside={trip?.name}>
            {trip && scope?.item ? (
              <>
                <Note>
                  Only you see these. The loss limit is for this trip; the reminder counts on every
                  trip.
                </Note>
                <Loaded query={stacks.limits(trip.id)} skeleton={<FieldsSkeleton fields={2} />}>
                  {(limits) => (
                    <LimitsForm
                      key={`${trip.id}-${limits.lossLimit}-${limits.sessionReminderMinutes}`}
                      limits={limits}
                      tripId={trip.id}
                      currency={scope.item!.group.currency}
                    />
                  )}
                </Loaded>
              </>
            ) : (
              <Note>Limits are set for a trip. Open one to set yours.</Note>
            )}
          </Section>
          <Section title="Appearance">
            <Segmented
              label="Appearance"
              options={themeChoices}
              value={theme}
              onChange={setTheme}
            />
          </Section>
          <Section title="Account">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setOpen(false);
                  clerk.openUserProfile();
                }}
              >
                Manage account
              </Button>
              <Button onClick={() => void clerk.signOut()}>Sign out</Button>
            </div>
          </Section>
        </div>
      </Dialog>
    </>
  );
}
