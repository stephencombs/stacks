import { useUser } from "@clerk/expo";
import { useNavigation } from "@react-navigation/native";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  type CrewActivityItem,
  type SessionId,
  type TripId,
  type VisitId,
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
import {
  formatDay,
  formatDuration,
  formatTime,
  gameNames,
  playerNames,
} from "@stacks/client-runtime/format";
import { newId } from "@stacks/client-runtime/ids";
import { useRecordingClock } from "@stacks/client-runtime/recordingReact";
import { closedPlays, localClock, tripDates, tripPlays } from "@stacks/client-runtime/trip";
import { tripStandings } from "@stacks/shared/trips";
import type * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";
import { useCallback, useState, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Money } from "../components/Money";
import { Button, IconButton } from "../components/ui/Button";
import { Choice, FormError, TextField } from "../components/ui/Field";
import { Icon } from "../components/ui/Icon";
import { Screen } from "../components/ui/Screen";
import { Sheet } from "../components/ui/Sheet";
import {
  EmptyState,
  List,
  PageTitle,
  Row,
  SectionHeading,
  Skeleton,
  Surface,
} from "../components/ui/Surface";
import { PlayerAvatar } from "../features/PlayerAvatar";
import { RowsSkeleton } from "../features/ScreenSkeletons";
import { useCrewScopes } from "../lib/crewScopes";
import { useGo } from "../lib/go";
import { usePreferences } from "../lib/preferences";
import { ScopeNotices } from "../lib/realtime";
import { Loaded, TripLoaded, useAction, useStacks } from "../lib/stacks";

/** Crew: the trip going now, pinned, then what everyone in your groups has been playing. */
export function CrewScreen() {
  return (
    <CrewNotices>
      <CrewContent />
    </CrewNotices>
  );
}

function CrewNotices({ children }: { children: ReactNode }) {
  return <ScopeNotices scopes={useCrewScopes()}>{children}</ScopeNotices>;
}

function CrewContent() {
  const stacks = useStacks();
  const [sheet, setSheet] = useState<"groups" | "create" | null>(null);
  const openGroups = useCallback(() => setSheet("groups"), []);

  return (
    <Screen
      live={Platform.OS !== "android"}
      onOpenGroups={openGroups}
      contentClassName={Platform.OS === "android" ? "gap-4 pt-1" : undefined}
    >
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
              <Feed groups={groups} />
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

export function CrewGroupsButton() {
  const go = useGo();

  return <Button label="Groups" size="sm" onPress={go.groups} />;
}

export function GroupsScreen() {
  const stacks = useStacks();
  const go = useGo();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [creating, setCreating] = useState(false);
  const select = (groupId: GroupId) => go.group(groupId, { replace: true });

  return (
    <Screen
      live={false}
      contentClassName="gap-3 pt-3"
      fab={
        <Button
          label="New group"
          size="fab"
          variant="primary"
          icon={<Icon name="plus" color="ink-inverse" />}
          onPress={() => setCreating(true)}
        />
      }
    >
      <View style={{ paddingTop: insets.top }}>
        <PageTitle
          inContent
          right={
            <IconButton
              accessibilityLabel="Close groups"
              icon={<Icon name="close" color="ink" />}
              onPress={() => navigation.goBack()}
            />
          }
        >
          Groups
        </PageTitle>
      </View>
      <Loaded query={stacks.groups} skeleton={<RowsSkeleton rows={3} />}>
        {(groups) =>
          groups.length ? (
            <GroupRows groups={groups} onSelect={select} />
          ) : (
            <EmptyState title="No groups yet">
              Create a group for the people you play with.
            </EmptyState>
          )
        }
      </Loaded>
      {creating ? <CreateGroupSheet onClose={() => setCreating(false)} onCreated={select} /> : null}
    </Screen>
  );
}

function CrewSkeleton() {
  return (
    <View accessibilityElementsHidden className="gap-6">
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

function PinnedTrip({ trip, group }: { trip: TripDetail; group: GroupDetail }) {
  const go = useGo();
  const names = playerNames(group);
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
          <Text numberOfLines={1} className="type-footnote text-muted">
            {group.group.name} · {tripDates(trip.trip)}
          </Text>
          <Text numberOfLines={1} className="type-title text-ink">
            {trip.trip.name}
          </Text>
        </View>
        {playing.length > 0 ? (
          <Text className="shrink type-footnote font-semibold text-live">
            ● {playing.length} playing
          </Text>
        ) : null}
      </Pressable>
      {top.length > 0 ? (
        <View accessibilityLabel="Standings" className="border-t border-line">
          {top.map((standing) => (
            <View
              key={standing.playerId}
              className="min-h-11 flex-row items-center gap-3 px-4 py-1.5"
            >
              <Text className="w-4 type-footnote text-muted">{standing.rank}</Text>
              <PlayerAvatar
                playerId={standing.playerId}
                name={names.get(standing.playerId) ?? ""}
                size={26}
                you={standing.playerId === group.myPlayerId}
              />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-semibold text-ink">
                {names.get(standing.playerId) ?? "Someone"}
                {standing.playerId === group.myPlayerId ? (
                  <Text className="font-normal text-muted"> · you</Text>
                ) : null}
              </Text>
              <Money
                amount={MinorUnits.make(standing.net)}
                currency={group.group.currency}
                tone="result"
                className="font-semibold"
              />
            </View>
          ))}
        </View>
      ) : (
        <Text className="border-t border-line px-4 py-3 type-footnote text-muted">
          Standings start when the first table finishes.
        </Text>
      )}
      <Row
        accessibilityLabel="Stats"
        onPress={() => go.stats({ groupId: group.group.id, tripId: trip.trip.id })}
      >
        <Text className="flex-1 type-callout font-semibold text-chip-blue">Stats</Text>
        <Icon name="chevron-right" color="faint" size={16} />
      </Row>
    </Surface>
  );
}

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

        const activity = items.map((item) => (
          <ActivityRow key={activityKey(item)} item={item} me={myPlayer(groups, item)} />
        ));

        return (
          <View className="gap-3">
            {items.length > 0 ? (
              <View className="gap-3">{activity}</View>
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

const myPlayer = (groups: ReadonlyArray<GroupListItem>, item: CrewActivityItem) =>
  groups.find((group) => group.group.id === item.group.id)?.myPlayerId;

function isSessionTarget<
  T extends { readonly kind: string; readonly sessionId?: SessionId | undefined },
>(item: T): item is T & { readonly sessionId: SessionId } {
  return item.kind === "session" && item.sessionId !== undefined;
}

function isVisitTarget<T extends { readonly kind: string; readonly visitId?: VisitId | undefined }>(
  item: T,
): item is T & { readonly visitId: VisitId } {
  return item.kind === "visit" && item.visitId !== undefined;
}

function isTripTarget<T extends { readonly kind: string; readonly tripId?: TripId | undefined }>(
  item: T,
): item is T & { readonly tripId: TripId } {
  return item.kind === "trip" && item.tripId !== undefined;
}

function isLiveHappening<
  T extends { readonly kind: string; readonly trip?: { readonly name: string } | undefined },
>(item: T): item is T & { readonly kind: "live" } {
  return item.kind === "live";
}

function isStartedHappening<
  T extends {
    readonly kind: string;
    readonly trip?: { readonly name: string; readonly startedAt: DateTime.Utc } | undefined;
  },
>(item: T): item is T & { readonly trip: NonNullable<T["trip"]> } {
  return item.kind === "started" && item.trip !== undefined;
}

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

function ActivityRow({ item, me }: { item: CrewActivityItem; me: PlayerId | undefined }) {
  const { privacyMode } = usePreferences();
  const go = useGo();
  const navigation = useNavigation();
  const target = activityTarget(item);

  const open = () =>
    Match.value(target).pipe(
      Match.when(isSessionTarget, (row) => go.session(row.sessionId)),
      Match.when(isVisitTarget, (row) => navigation.navigate("Play", { visitId: row.visitId })),
      Match.when(isTripTarget, (row) => go.trip(row.tripId)),
      Match.orElse(() => undefined),
    );

  const hint = target.kind === "trip" ? "Opens the trip" : "Opens the session";
  const finished = item.kind === "session_finished" || item.kind === "table_finished";

  const firstPlayer =
    item.kind === "trip_started" || (finished && item.players.length > 1)
      ? undefined
      : item.players[0];

  const row = (title: string, meta: string, results?: ReactNode) => (
    <List>
      <Row accessibilityHint={hint} onPress={open} className="items-start gap-3 py-4">
        {item.kind === "trip_started" ? (
          <View className="size-8 items-center justify-center rounded-full bg-tint-orange">
            <Icon name="trip" color="chip-orange" size={18} />
          </View>
        ) : firstPlayer ? (
          <ActivityChip groupId={item.group.id} player={firstPlayer} />
        ) : null}
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={2} className="type-callout font-semibold text-ink">
            {title}
          </Text>
          <Text className="type-footnote text-muted">{meta}</Text>
          {results ? <View className="pt-1">{results}</View> : null}
        </View>
      </Row>
    </List>
  );

  if (item.kind === "trip_started") {
    return row(
      item.group.name,
      formatDay(item.startedAt),
      <Text className="type-callout text-ink">Started {item.trip.name}</Text>,
    );
  }

  const venue = item.venue?.name ?? "a table";

  const game =
    item.kind === "table_live" || item.kind === "table_finished"
      ? item.game && gameNames[item.game]
      : null;

  if (item.kind === "session_live" || item.kind === "table_live") {
    const players = nameList(item.players.map((player) => player.displayName));

    return row(
      players || venue,
      `Now · ${item.trip.name}`,
      <Text className="type-callout text-ink">
        {game ? `Playing ${game.toLowerCase()} at ${venue}` : `Playing at ${venue}`}
        {" · "}
        <ActivityLiveDuration startedAt={item.startedAt} />
      </Text>,
    );
  }

  const results = item.players.toSorted((a, b) => b.net - a.net);

  if (results.length === 1 && firstPlayer) {
    const player = results[0]!;
    const name = player.playerId === me ? "You" : player.displayName;

    return row(
      name,
      `${formatDay(item.endedAt)} · ${item.trip.name}`,
      <Text className="type-callout text-ink">
        {privacyMode ? (
          <Money amount={player.net} currency={item.group.currency} tone="result" />
        ) : player.net === 0 ? (
          "Broke even"
        ) : (
          <>
            {player.net > 0 ? "Won " : "Lost "}
            <Money
              amount={MinorUnits.make(Math.abs(player.net))}
              currency={item.group.currency}
              className={player.net > 0 ? "font-bold text-win" : "font-bold text-loss"}
            />
          </>
        )}
        {game ? ` playing ${game.toLowerCase()} at ${venue}` : ` at ${venue}`}
      </Text>,
    );
  }

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

function ActivityLiveDuration({ startedAt }: { startedAt: DateTime.Utc }) {
  const now = useRecordingClock();

  return <Text className="font-semibold text-live">live {formatDuration(startedAt, now)}</Text>;
}

function ActivityChip({
  groupId,
  player,
}: {
  groupId: GroupId;
  player: { playerId: PlayerId | null; displayName: string };
}) {
  const stacks = useStacks();

  const neutral = (
    <View className="size-8 items-center justify-center rounded-full bg-fill">
      <Icon name="person" color="muted" size={18} />
    </View>
  );

  const { playerId, displayName } = player;

  if (!playerId) return neutral;

  return (
    <Loaded query={stacks.group(groupId)} skeleton={neutral} renderError={() => neutral}>
      {(detail) => (
        <PlayerAvatar
          playerId={playerId}
          name={displayName}
          size={32}
          you={playerId === detail.myPlayerId}
        />
      )}
    </Loaded>
  );
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "MXN", "JPY"] as const;

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
      <GroupRows
        groups={groups}
        onSelect={(groupId) => {
          onClose();
          go.group(groupId);
        }}
      />
    </Sheet>
  );
}

function GroupRows({
  groups,
  onSelect,
}: {
  groups: ReadonlyArray<GroupListItem>;
  onSelect: (groupId: GroupId) => void;
}) {
  return (
    <List>
      {groups.map((item) => (
        <Row
          key={item.group.id}
          accessibilityHint="Opens the group"
          onPress={() => onSelect(item.group.id)}
        >
          <GroupRow item={item} />
          <Icon name="chevron-right" color="faint" />
        </Row>
      ))}
    </List>
  );
}

function GroupRow({ item }: { item: GroupListItem }) {
  const stacks = useStacks();
  const happening = groupHappening(item);

  const status = Match.value(happening).pipe(
    Match.when(isLiveHappening, (live) => (live.trip ? `${live.trip.name} is live` : "Live now")),
    Match.when(
      isStartedHappening,
      (started) => `${started.trip.name} started ${formatDay(started.trip.startedAt)}`,
    ),
    Match.orElse(() => "No trips yet"),
  );

  return (
    <Loaded
      query={stacks.group(item.group.id)}
      skeleton={<GroupListLabel name={item.group.name} status={status} />}
      renderError={() => <GroupListLabel name={item.group.name} status={status} />}
    >
      {(detail) => {
        const people = detail.players.filter(
          (player) => player.role !== null || player.claimCode !== null,
        );

        return (
          <>
            <View className="flex-row">
              {people.slice(0, 3).map((player, index) => (
                <View key={player.id} className={index ? "-ml-1.5" : undefined}>
                  <PlayerAvatar
                    playerId={player.id}
                    name={player.displayName}
                    size={26}
                    you={player.id === detail.myPlayerId}
                  />
                </View>
              ))}
            </View>
            <GroupListLabel
              name={item.group.name}
              status={`${people.length} ${people.length === 1 ? "person" : "people"} · ${status}`}
            />
          </>
        );
      }}
    </Loaded>
  );
}

function GroupListLabel({ name, status }: { name: string; status: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="type-heading font-bold text-ink">{name}</Text>
      <Text className="type-footnote text-muted">{status}</Text>
    </View>
  );
}

function CreateGroupSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (groupId: GroupId) => void;
}) {
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
      (onCreated ?? go.group)(detail.group.id);
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
        onChangeText={(value) => {
          setName(value);
          setNameError(null);
        }}
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
