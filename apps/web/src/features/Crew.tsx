import { useUser } from "@clerk/react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CurrencyCode,
  GroupId,
  type CrewActivityItem,
  type GroupDetail,
  type GroupListItem,
  type PlayerId,
  type Trip,
  type TripDetail,
} from "@stacks/contracts";
import {
  activityTarget,
  crewFeed,
  groupHappening,
  livePlayerIds,
  nameList,
  pinnedTrip,
} from "@stacks/client-runtime/crew";
import { formatDay, formatTime, gameNames, playerNames } from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { chipOf, closedPlays, localClock, tripDates, tripPlays } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import { ChevronRight, Plus, Users } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Money } from "~/components/Money";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { Field, FormError, Input, Select } from "~/components/ui/Field";
import { EmptyState, Section, TabTitle } from "~/components/ui/Page";
import { Glow, List, RowLink, RowText, Skeleton, Surface, Tag } from "~/components/ui/Surface";
import { Loaded, TripLoaded, useAction, useStacks } from "~/lib/stacks";
import { Chip } from "./Chip";
import { RowsSkeleton, SkeletonText } from "./PageSkeletons";
import { StatsLink } from "./StatsLink";

/** Crew: the trip going now, pinned, then what everyone in your groups has been playing. */
export function Crew() {
  const stacks = useStacks();
  const [listing, setListing] = useState(false);
  const [creating, setCreating] = useState(false);
  return (
    <>
      <TabTitle>Crew</TabTitle>
      <Loaded query={stacks.groups} skeleton={<CrewSkeleton />}>
        {(groups) => (
          <>
            {groups.length > 0 ? (
              <div className="-mb-4 flex justify-end">
                <Button variant="tint" onClick={() => setListing(true)}>
                  <Users className="size-4" aria-hidden />
                  Groups
                </Button>
              </div>
            ) : null}
            {groups.length === 0 ? (
              <div className="flex flex-col items-start gap-4">
                <EmptyState title="Start a group for the people you play with">
                  A group shares its trips, tables and results. If a friend already made one, open
                  the invite link they sent you to join it.
                </EmptyState>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus className="size-4" aria-hidden />
                  New group
                </Button>
              </div>
            ) : (
              <Feed groups={groups} />
            )}
            <GroupsDialog
              groups={groups}
              open={listing}
              onOpenChange={setListing}
              onCreate={() => {
                setListing(false);
                setCreating(true);
              }}
            />
          </>
        )}
      </Loaded>
      <CreateGroupDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function CrewSkeleton() {
  return (
    <div aria-hidden className="flex animate-skeleton-in flex-col gap-8">
      <Skeleton className="h-48 w-full rounded-xl" />
      <RowsSkeleton rows={4} trailing={false} />
    </div>
  );
}

function Feed({ groups }: { groups: ReadonlyArray<GroupListItem> }) {
  const pinned = pinnedTrip(groups);
  return (
    <>
      {pinned ? (
        <TripLoaded
          tripId={pinned.trip.id}
          skeleton={<Skeleton className="h-48 w-full rounded-xl" />}
        >
          {(trip, group) => <PinnedTrip trip={trip} group={group} />}
        </TripLoaded>
      ) : null}
      <Section title="Activity">
        <ActivityPage groups={groups} />
      </Section>
    </>
  );
}

/** The trip going now: who's at a table, and the top of its standings. */
function PinnedTrip({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const names = playerNames(group);
  const playing = livePlayerIds(tripPlays(trip));
  const top = tripStandings(closedPlays(trip), localClock)
    .toSorted((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const currency = group.group.currency;
  return (
    <Surface className="relative overflow-hidden">
      {playing.length > 0 ? <Glow tone="felt" /> : null}
      <div className="relative flex flex-col">
        <Link
          to="/trips/$tripId"
          params={{ tripId: trip.trip.id }}
          className="flex items-center gap-3 px-4 pt-4 pb-3 transition-colors duration-150 hover:bg-fill"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-display text-3xl leading-none uppercase">
              {trip.trip.name}
            </span>
            <span className="text-sm text-muted">
              {group.group.name} · {tripDates(trip.trip)}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </Link>
        {playing.length > 0 ? (
          <div className="flex items-center gap-3 px-4 pb-3">
            <Tag tone="live">Live</Tag>
            <span aria-hidden className="flex shrink-0 -space-x-2">
              {playing.slice(0, 5).map((id) => (
                <Chip key={id} chip={chipOf(group, id)} name={names.get(id) ?? ""} size={24} />
              ))}
            </span>
            <span className="min-w-0 truncate text-sm">
              {nameList(
                playing.map((id) =>
                  id === group.myPlayerId ? "You" : (names.get(id) ?? "Someone"),
                ),
              )}{" "}
              playing
            </span>
          </div>
        ) : null}
        {top.length > 0 ? (
          <ol aria-label="Standings" className="border-t border-line">
            {top.map((standing) => (
              <li key={standing.playerId} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                <span className="w-4 text-sm text-muted tabular-nums">{standing.rank}</span>
                <Chip
                  chip={chipOf(group, standing.playerId)}
                  name={names.get(standing.playerId) ?? ""}
                  size={24}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {standing.playerId === group.myPlayerId
                    ? "You"
                    : (names.get(standing.playerId) ?? "Someone")}
                </span>
                <Money
                  amount={standing.net}
                  currency={currency}
                  tone="result"
                  className="text-sm"
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="border-t border-line px-4 py-3 text-sm text-muted">
            Standings start when the first table finishes.
          </p>
        )}
        <div className="flex border-t border-line p-2">
          <StatsLink
            pick={{ groupId: group.group.id, tripId: trip.trip.id }}
            variant="ghost"
            className="flex-1"
          />
        </div>
      </div>
    </Surface>
  );
}

/** One page of activity; older pages load under it, one at a time. */
function ActivityPage({
  groups,
  cursor,
}: {
  groups: ReadonlyArray<GroupListItem>;
  cursor?: string;
}) {
  const stacks = useStacks();
  const [older, setOlder] = useState(false);
  return (
    <Loaded
      query={stacks.crewActivity(cursor)}
      skeleton={<RowsSkeleton rows={cursor ? 2 : 4} trailing={false} />}
    >
      {(page) => {
        const items = crewFeed(page.items, groups);
        return (
          <div className="flex flex-col gap-3">
            {items.length > 0 ? (
              <List as="ul" label={cursor ? "Older activity" : "Activity"}>
                {items.map((item) => (
                  <li key={activityKey(item)}>
                    <ActivityRow item={item} me={myPlayer(groups, item)} />
                  </li>
                ))}
              </List>
            ) : cursor === undefined && page.nextCursor === null ? (
              <EmptyState title="Nothing here yet">
                When someone in your groups sits down at a table or starts a trip, it shows here.
              </EmptyState>
            ) : null}
            {page.nextCursor === null ? null : older ? (
              <ActivityPage groups={groups} cursor={page.nextCursor} />
            ) : (
              <Button className="self-center" onClick={() => setOlder(true)}>
                Show older
              </Button>
            )}
          </div>
        );
      }}
    </Loaded>
  );
}

/** Your player in the item's group, so your own result reads "You". */
const myPlayer = (groups: ReadonlyArray<GroupListItem>, item: CrewActivityItem) =>
  groups.find((group) => group.group.id === item.group.id)?.myPlayerId;

const activityKey = (item: CrewActivityItem) => {
  switch (item.kind) {
    case "session_live":
    case "session_finished":
      return item.sessionId;
    case "table_live":
    case "table_finished":
      return item.tableId;
    case "trip_started":
      return item.trip.id;
  }
};

function ActivityLink({ item, children }: { item: CrewActivityItem; children: ReactNode }) {
  const target = activityTarget(item);
  return target.kind === "session" ? (
    <RowLink to="/sessions/$sessionId" params={{ sessionId: target.sessionId }}>
      {children}
    </RowLink>
  ) : target.kind === "visit" ? (
    <RowLink to="/play/$visitId" params={{ visitId: target.visitId }}>
      {children}
    </RowLink>
  ) : (
    <RowLink to="/trips/$tripId" params={{ tripId: target.tripId }}>
      {children}
    </RowLink>
  );
}

/** A row of the feed: who's playing where, how a table went, or a trip starting. */
function ActivityRow({ item, me }: { item: CrewActivityItem; me: PlayerId | undefined }) {
  if (item.kind === "trip_started")
    return (
      <ActivityLink item={item}>
        <RowText
          title={`${item.trip.name} started`}
          meta={`${item.group.name} · ${formatDay(item.startedAt)}`}
        />
      </ActivityLink>
    );
  const venue = item.venue?.name ?? "a table";
  const game =
    item.kind === "table_live" || item.kind === "table_finished"
      ? item.game && gameNames[item.game]
      : null;
  if (item.kind === "session_live" || item.kind === "table_live")
    return (
      <ActivityLink item={item}>
        <RowText
          title={`${nameList(item.players.map((player) => player.displayName))} at ${venue}`}
          meta={[game, item.trip.name, `since ${formatTime(item.startedAt)}`]
            .filter(Boolean)
            .join(" · ")}
        />
        <Tag tone="live">Live</Tag>
      </ActivityLink>
    );
  const results = item.players.toSorted((a, b) => b.net - a.net);
  const seenGuests = new Map<string, number>();
  const playerKey = (playerId: (typeof results)[number]["playerId"], displayName: string) => {
    if (playerId) return playerId;
    const n = (seenGuests.get(displayName) ?? 0) + 1;
    seenGuests.set(displayName, n);
    return `guest-${displayName}-${n}`;
  };
  return (
    <ActivityLink item={item}>
      <RowText
        title={venue}
        meta={
          <>
            <span className="flex flex-wrap gap-x-3">
              {results.slice(0, 4).map((player) => (
                <span
                  key={playerKey(player.playerId, player.displayName)}
                  className="whitespace-nowrap"
                >
                  <span className="text-ink">
                    {player.playerId === me ? "You" : player.displayName}
                  </span>{" "}
                  <Money amount={player.net} currency={item.group.currency} tone="result" />
                </span>
              ))}
              {results.length > 4 ? <span>+{results.length - 4} more</span> : null}
            </span>
            <span className="block">
              {[game, item.trip.name, `${formatDay(item.endedAt)}, ${formatTime(item.endedAt)}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        }
      />
    </ActivityLink>
  );
}

/** Every group you're in, with who's in it and what it has going. No amounts: debts come later. */
function GroupsDialog({
  groups,
  open,
  onOpenChange,
  onCreate,
}: {
  groups: ReadonlyArray<GroupListItem>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Groups"
      footer={
        <Button size="lg" className="w-full" onClick={onCreate}>
          <Plus className="size-4" aria-hidden />
          New group
        </Button>
      }
    >
      <List as="ul" label="Your groups">
        {groups.map((item) => (
          <li key={item.group.id}>
            <RowLink
              to="/groups/$groupId"
              params={{ groupId: item.group.id }}
              onClick={() => onOpenChange(false)}
            >
              <GroupRow item={item} />
            </RowLink>
          </li>
        ))}
      </List>
    </Dialog>
  );
}

const happeningLine = (trip: Trip | undefined, live: boolean) =>
  live
    ? trip
      ? `Live now · ${trip.name}`
      : "Live now"
    : trip
      ? `${trip.name} · started ${formatDay(trip.startedAt)}`
      : "No trips yet";

function GroupRow({ item }: { item: GroupListItem }) {
  const stacks = useStacks();
  const happening = groupHappening(item);
  const live = happening.kind === "live";
  return (
    <>
      <RowText
        title={item.group.name}
        meta={
          <>
            <span className="block">
              {happeningLine(happening.kind === "none" ? undefined : happening.trip, live)}
            </span>
            <Loaded
              query={stacks.group(item.group.id)}
              skeleton={<SkeletonText size="sm" className="w-32" />}
              renderError={() => null}
            >
              {(detail) => <span className="block truncate">{peopleLine(detail)}</span>}
            </Loaded>
          </>
        }
      />
      {live ? <Tag tone="live">Live</Tag> : null}
    </>
  );
}

const peopleLine = (detail: GroupDetail) =>
  nameList(
    detail.players
      .filter((player) => player.role !== null || player.claimCode !== null)
      .map((player) => (player.id === detail.myPlayerId ? "you" : player.displayName)),
  );

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "JPY"] as const;

function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stacks = useStacks();
  const navigate = useNavigate();
  const { user } = useUser();
  const create = useAction(stacks.Client.mutation("groups", "create"));
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name")).trim();
    const displayName = String(form.get("displayName")).trim();
    if (!name) return setNameError("Give the group a name.");
    setNameError(null);
    const detail = await create.run({
      payload: {
        id: GroupId.make(newId()),
        name,
        currency: CurrencyCode.make(String(form.get("currency"))),
        displayName: displayName || "Me",
      },
    });
    if (detail) {
      onOpenChange(false);
      void navigate({ to: "/groups/$groupId", params: { groupId: detail.group.id } });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="Everyone in a group shares its trips and results, in one currency."
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Group name" error={nameError}>
          {(props) => (
            <Input
              {...props}
              name="name"
              placeholder="Vegas crew"
              autoComplete="off"
              maxLength={80}
            />
          )}
        </Field>
        <Field label="Your name in this group">
          {(props) => (
            <Input
              {...props}
              name="displayName"
              defaultValue={user?.firstName ?? ""}
              maxLength={60}
              autoComplete="given-name"
            />
          )}
        </Field>
        <Field label="Currency" hint="Can't be changed later.">
          {(props) => (
            <Select {...props} name="currency" defaultValue="USD">
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {create.error ? <FormError>{create.error}</FormError> : null}
        <Button type="submit" variant="primary" size="lg" pending={create.pending}>
          Create group
        </Button>
      </form>
    </Dialog>
  );
}
