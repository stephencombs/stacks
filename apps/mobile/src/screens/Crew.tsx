import { useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  type CrewActivityItem,
  type GroupDetail,
  type GroupListItem,
  type PlayerId,
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
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import {
  EmptyState,
  List,
  Row,
  SectionHeading,
  Skeleton,
  Surface,
  Tag,
} from "../components/ui/Surface";
import { Chip } from "../features/Chip";
import { RowsSkeleton } from "../features/ScreenSkeletons";
import { useGo } from "../lib/go";
import { Loaded, TripLoaded, useAction, useStacks } from "../lib/stacks";

/** Crew: the trip going now, pinned, then what everyone in your groups has been playing. */
export function CrewScreen() {
  const stacks = useStacks();
  const [sheet, setSheet] = useState<"groups" | "create" | null>(null);
  return (
    <Screen>
      <Loaded query={stacks.groups} skeleton={<CrewSkeleton />}>
        {(groups) => (
          <>
            {groups.length === 0 ? (
              <EmptyState
                title="Start a group for the people you play with"
                action={
                  <Button
                    label="New group"
                    variant="primary"
                    className="self-start"
                    onPress={() => setSheet("create")}
                  />
                }
              >
                A group shares its trips, tables and results. If a friend already made one, open the
                invite link they sent you to join it.
              </EmptyState>
            ) : (
              <>
                <Button
                  label="Groups"
                  variant="tint"
                  size="sm"
                  icon={<Icon name="group" color="ink" size={16} />}
                  className="self-end"
                  onPress={() => setSheet("groups")}
                />
                <Feed groups={groups} />
              </>
            )}
            <GroupsSheet
              groups={groups}
              mode={sheet}
              onMode={setSheet}
              onClose={() => setSheet(null)}
            />
          </>
        )}
      </Loaded>
    </Screen>
  );
}

function CrewSkeleton() {
  return (
    <View accessibilityElementsHidden className="gap-6">
      <Skeleton className="h-11 w-28 self-end rounded-full" />
      <Skeleton className="h-[220px] rounded-2xl" />
      <RowsSkeleton rows={4} />
    </View>
  );
}

function Feed({ groups }: { groups: ReadonlyArray<GroupListItem> }) {
  const pinned = pinnedTrip(groups);
  return (
    <>
      {pinned ? (
        <TripLoaded
          tripId={pinned.trip.id}
          skeleton={<Skeleton className="h-[220px] rounded-2xl" />}
        >
          {(trip, group) => <PinnedTrip trip={trip} group={group} />}
        </TripLoaded>
      ) : null}
      <View className="gap-2">
        <SectionHeading>Activity</SectionHeading>
        <ActivityPage groups={groups} />
      </View>
    </>
  );
}

/** The trip going now: who's at a table, and the top of its standings. */
function PinnedTrip({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const names = playerNames(group);
  const name = (id: PlayerId) => (id === group.myPlayerId ? "You" : (names.get(id) ?? "Someone"));
  const playing = livePlayerIds(tripPlays(trip));
  const top = tripStandings(closedPlays(trip), localClock)
    .toSorted((a, b) => a.rank - b.rank)
    .slice(0, 3);
  return (
    <Surface>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the trip"
        onPress={() => go.trip(trip.trip.id)}
        className="flex-row items-center gap-3 px-4 pt-4 pb-3 active:bg-fill"
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text numberOfLines={1} className="type-title text-ink">
            {trip.trip.name}
          </Text>
          <Text className="type-footnote text-muted">
            {group.group.name} · {tripDates(trip.trip)}
          </Text>
        </View>
        <Icon name="chevron-right" color="faint" />
      </Pressable>
      {playing.length > 0 ? (
        <View className="flex-row items-center gap-3 px-4 pb-3">
          <Tag tone="live">Live</Tag>
          <Text numberOfLines={1} className="min-w-0 flex-1 type-footnote text-ink">
            {nameList(playing.map(name))} playing
          </Text>
        </View>
      ) : null}
      {top.length > 0 ? (
        <View accessibilityLabel="Standings" className="border-t border-line">
          {top.map((standing) => (
            <View
              key={standing.playerId}
              className="min-h-11 flex-row items-center gap-3 px-4 py-1.5"
            >
              <Text className="w-4 type-footnote text-muted">{standing.rank}</Text>
              <Chip
                chip={chipOf(group, standing.playerId)}
                name={names.get(standing.playerId) ?? ""}
                size={24}
              />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-base text-ink">
                {name(standing.playerId)}
              </Text>
              <Money
                amount={MinorUnits.make(standing.net)}
                currency={group.group.currency}
                tone="result"
              />
            </View>
          ))}
        </View>
      ) : (
        <Text className="border-t border-line px-4 py-3 type-footnote text-muted">
          Standings start when the first table finishes.
        </Text>
      )}
      <View className="border-t border-line p-2">
        <Button
          label="Stats"
          variant="ghost"
          icon={<Icon name="stats" color="ink" size={16} />}
          onPress={() => go.stats({ groupId: group.group.id, tripId: trip.trip.id })}
        />
      </View>
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
    <Loaded query={stacks.crewActivity(cursor)} skeleton={<RowsSkeleton rows={cursor ? 2 : 4} />}>
      {(page) => {
        const items = crewFeed(page.items, groups);
        return (
          <View className="gap-3">
            {items.length > 0 ? (
              <List>
                {items.map((item) => (
                  <ActivityRow key={activityKey(item)} item={item} me={myPlayer(groups, item)} />
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
              <Button label="Show older" className="self-center" onPress={() => setOlder(true)} />
            )}
          </View>
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

/** A row of the feed: who's playing where, how a table went, or a trip starting. */
function ActivityRow({ item, me }: { item: CrewActivityItem; me: PlayerId | undefined }) {
  const go = useGo();
  const navigation = useNavigation();
  const target = activityTarget(item);
  const open = () =>
    target.kind === "session"
      ? go.session(target.sessionId)
      : target.kind === "visit"
        ? navigation.navigate("Play", { visitId: target.visitId })
        : go.trip(target.tripId);
  const hint = target.kind === "trip" ? "Opens the trip" : "Opens the session";
  const row = (title: string, meta: string, trailing?: ReactNode, results?: ReactNode) => (
    <Row accessibilityHint={hint} onPress={open}>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2} className="type-heading text-ink">
          {title}
        </Text>
        {results}
        <Text className="type-footnote text-muted">{meta}</Text>
      </View>
      {trailing}
      <Icon name="chevron-right" color="faint" />
    </Row>
  );
  if (item.kind === "trip_started")
    return row(`${item.trip.name} started`, `${item.group.name} · ${formatDay(item.startedAt)}`);
  const venue = item.venue?.name ?? "a table";
  const game =
    item.kind === "table_live" || item.kind === "table_finished"
      ? item.game && gameNames[item.game]
      : null;
  if (item.kind === "session_live" || item.kind === "table_live")
    return row(
      `${nameList(item.players.map((player) => player.displayName))} at ${venue}`,
      [game, item.trip.name, `since ${formatTime(item.startedAt)}`].filter(Boolean).join(" · "),
      <Tag tone="live">Live</Tag>,
    );
  const results = item.players.toSorted((a, b) => b.net - a.net);
  const seenGuests = new Map<string, number>();
  const playerKey = (playerId: (typeof results)[number]["playerId"], displayName: string) => {
    if (playerId) return playerId;
    const n = (seenGuests.get(displayName) ?? 0) + 1;
    seenGuests.set(displayName, n);
    return `guest-${displayName}-${n}`;
  };
  return row(
    venue,
    [game, item.trip.name, `${formatDay(item.endedAt)}, ${formatTime(item.endedAt)}`]
      .filter(Boolean)
      .join(" · "),
    undefined,
    <View className="flex-row flex-wrap gap-x-3">
      {results.slice(0, 4).map((player) => (
        <Text
          key={playerKey(player.playerId, player.displayName)}
          className="type-footnote text-ink"
        >
          {player.playerId === me ? "You" : player.displayName}{" "}
          <Money amount={player.net} currency={item.group.currency} tone="result" />
        </Text>
      ))}
      {results.length > 4 ? (
        <Text className="type-footnote text-muted">+{results.length - 4} more</Text>
      ) : null}
    </View>,
  );
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "JPY"] as const;

/**
 * Your groups, with who's in each and what it has going, and a new one. No amounts: debts come
 * later. One sheet for both, so starting a group never stacks a sheet on a sheet.
 */
function GroupsSheet({
  groups,
  mode,
  onMode,
  onClose,
}: {
  groups: ReadonlyArray<GroupListItem>;
  mode: "groups" | "create" | null;
  onMode: (mode: "groups" | "create") => void;
  onClose: () => void;
}) {
  const go = useGo();
  if (mode === "create") return <CreateGroupSheet onClose={onClose} />;
  return (
    <Sheet
      open={mode === "groups"}
      onClose={onClose}
      title="Groups"
      footer={<Button label="New group" size="lg" onPress={() => onMode("create")} />}
    >
      <List>
        {groups.map((item) => (
          <Row
            key={item.group.id}
            accessibilityHint="Opens the group"
            onPress={() => {
              onClose();
              go.group(item.group.id);
            }}
          >
            <GroupRow item={item} />
            <Icon name="chevron-right" color="faint" />
          </Row>
        ))}
      </List>
    </Sheet>
  );
}

function GroupRow({ item }: { item: GroupListItem }) {
  const stacks = useStacks();
  const happening = groupHappening(item);
  const line =
    happening.kind === "live"
      ? happening.trip
        ? `Live now · ${happening.trip.name}`
        : "Live now"
      : happening.kind === "started"
        ? `${happening.trip.name} · started ${formatDay(happening.trip.startedAt)}`
        : "No trips yet";
  return (
    <View className="flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="shrink type-heading text-ink">
          {item.group.name}
        </Text>
        {happening.kind === "live" ? <Tag tone="live">Live</Tag> : null}
      </View>
      <Text className="type-footnote text-muted">{line}</Text>
      <Loaded
        query={stacks.group(item.group.id)}
        skeleton={<Skeleton className="h-3 w-32" />}
        renderError={() => null}
      >
        {(detail) => (
          <Text numberOfLines={1} className="type-footnote text-muted">
            {nameList(
              detail.players
                .filter((player) => player.role !== null || player.claimCode !== null)
                .map((player) => (player.id === detail.myPlayerId ? "you" : player.displayName)),
            )}
          </Text>
        )}
      </Loaded>
    </View>
  );
}

function CreateGroupSheet({ onClose }: { onClose: () => void }) {
  const stacks = useStacks();
  const go = useGo();
  const { user } = useUser();
  const create = useAction(stacks.Client.mutation("groups", "create"));
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(user?.firstName ?? "");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("USD");
  const [nameError, setNameError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setNameError("Give the group a name.");
    setNameError(null);
    const detail = await create.run({
      payload: {
        id: GroupId.make(newId()),
        name: name.trim(),
        currency: CurrencyCode.make(currency),
        displayName: displayName.trim() || "Me",
      },
    });
    if (detail) {
      onClose();
      go.group(detail.group.id);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      busy={create.pending}
      title="New group"
      description="Everyone in a group shares its trips and results, in one currency."
      footer={
        <Button
          label="Create group"
          variant="primary"
          size="lg"
          pending={create.pending}
          onPress={() => void submit()}
        />
      }
    >
      <TextField
        label="Group name"
        testID="group-name"
        value={name}
        onChangeText={setName}
        placeholder="Vegas crew"
        maxLength={80}
        error={nameError}
      />
      <TextField
        label="Your name in this group"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
      />
      <Choice
        label="Currency"
        options={CURRENCIES.map((code) => ({ value: code, label: code }))}
        value={currency}
        onChange={setCurrency}
      />
      {create.error ? <FormError>{create.error}</FormError> : null}
    </Sheet>
  );
}
