import { useAtomValue } from "@effect/atom-react";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { groupChip } from "@stacks/client-runtime/groupStats";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import { personalStatsView, type StatsFilters } from "@stacks/client-runtime/stats";
import { tripNames } from "@stacks/client-runtime/trip";
import { GroupId, TripId, groupScope, type GroupListItem, type Trip } from "@stacks/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, View, type ScrollViewInstance } from "react-native";
import { Text } from "../components/ui/Text";
import Svg, { Line } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Button } from "../components/ui/Button";
import { offsetBelowHeader } from "../components/ui/scrollClamp";
import { isLiquidGlassSupported } from "../lib/liquidGlass";
import { FilterChip } from "../components/ui/FilterChip";
import { EmptyState } from "../components/ui/Surface";
import { GroupStatsView } from "../features/GroupStats";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet } from "../features/RecordingForms";
import {
  MoneySection,
  PatternsSection,
  PeriodSection,
  RecordsSection,
  StatsHero,
  type StatsSummary,
} from "../features/PersonalStats";
import { StatsSkeleton } from "../features/ScreenSkeletons";
import {
  AndroidGroupChip,
  AndroidStatsEmpty,
  ByCasino,
  ByGame,
  Filters,
  StatsContent,
} from "../features/StatsParts";
import { useAccount } from "../lib/account";
import { ScopeNotices } from "../lib/realtime";
import { StacksProvider, useStacks, useStatsCopies } from "../lib/stacks";

/** The group, and maybe trip, Stats opens on: from a trip or group's Stats, or an old Board link. */
type Props = StaticScreenProps<{ groupId?: string; tripId?: string } | undefined>;

/**
 * Your own play, broken down, from this device's sessions: it works signed out and offline.
 * Signed in, the Group chip switches the screen to one of your groups.
 */
export function StatsScreen({ route }: Props) {
  const navigation = useNavigation();
  const android = Platform.OS === "android";
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offset = useRef(0);
  const headerHeight = useHeaderHeight();
  useLayoutEffect(() => {
    if (android) navigation.setOptions({ headerShown: false });
  }, [android, navigation]);

  const pick = {
    ...(route.params?.groupId ? { groupId: GroupId.make(route.params.groupId) } : null),
    ...(route.params?.tripId ? { tripId: TripId.make(route.params.tripId) } : null),
  };

  // WARNING: under a transparent iOS 26 bar, y: 0 scrolls the filter chips behind it.
  const backToTop = () => {
    const y = offsetBelowHeader(offset.current, isLiquidGlassSupported ? headerHeight : 0);

    if (y !== null) scrollRef.current?.scrollTo({ y, animated: true });
  };

  const stats = (
    <YourGroups>
      {(groups) => (
        <StatsView
          key={`${pick.groupId}:${pick.tripId}`}
          pick={groups ? pick : justMe}
          groups={groups ?? noGroups}
          onFilterChange={android ? undefined : backToTop}
        />
      )}
    </YourGroups>
  );

  return android ? (
    stats
  ) : (
    <PersonalScreen
      live
      scrollRef={scrollRef}
      onScroll={(event) => {
        offset.current = event.nativeEvent.contentOffset.y;
      }}
    >
      {stats}
    </PersonalScreen>
  );
}

type Pick = { readonly groupId?: GroupId; readonly tripId?: TripId };

const justMe: Pick = {};
const noGroups: ReadonlyArray<GroupListItem> = [];
const remembered = new WeakSet<object>();

function YourGroups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem> | null) => ReactNode;
}) {
  const account = useAccount();

  if (!account.available || !account.isSignedIn || !account.userId) return children(null);

  return (
    <StacksProvider>
      <SignedInGroups>{children}</SignedInGroups>
    </StacksProvider>
  );
}

function SignedInGroups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem>) => ReactNode;
}) {
  const result = useAtomValue(useStacks().groups);
  const copies = useStatsCopies();
  useEffect(() => {
    if (!copies || !AsyncResult.isSuccess(result) || remembered.has(result.value)) return;
    remembered.add(result.value);
    copies.rememberGroups(result.value);
  }, [copies, result]);
  const groups = AsyncResult.getOrElse(result, () => noGroups);

  return children(groups);
}

function StatsView({
  pick,
  groups,
  onFilterChange,
}: {
  pick: Pick;
  groups: ReadonlyArray<GroupListItem>;
  onFilterChange?: (() => void) | undefined;
}) {
  const copies = useStatsCopies();
  const [picked, setPicked] = useState<Pick>(pick);
  const [filters, setFilters] = useState<StatsFilters>(pick.tripId ? { tripId: pick.tripId } : {});

  const updateFilters = (next: StatsFilters) => {
    setFilters(next);
    onFilterChange?.();
  };

  const rememberedTrip = picked.tripId && copies ? copies.groupOfTrip(picked.tripId) : null;

  const groupId =
    picked.groupId ??
    groups.find((item) => item.trips.some((trip) => trip.id === picked.tripId))?.group.id ??
    rememberedTrip?.groupId ??
    null;

  const fallbackName =
    groupId === null ? null : (copies?.groupName(groupId) ?? rememberedTrip?.groupName ?? null);

  const chip =
    groups.length === 0 && groupId === null ? null : (
      <GroupChip
        groups={groups}
        groupId={groupId}
        fallbackName={fallbackName}
        onChange={(next) => {
          setPicked(next === null ? {} : { groupId: next });
          onFilterChange?.();

          const keep =
            next === null ||
            groups.some(
              (item) =>
                item.group.id === next && item.trips.some((trip) => trip.id === filters.tripId),
            );

          if (!keep) setFilters({ ...filters, tripId: undefined });
        }}
      />
    );

  const group = groups.find((item) => item.group.id === groupId);

  return groupId === null ? (
    <JustMe
      names={tripNames(groups)}
      trips={groups.flatMap((item) => item.trips)}
      chip={chip}
      filters={filters}
      onFilters={updateFilters}
    />
  ) : (
    <ScopeNotices key={groupId} scopes={[groupScope(groupId)]}>
      <GroupStatsView
        groupId={groupId}
        groupName={group?.group.name ?? fallbackName ?? "This group"}
        currentTripId={group?.currentTripId ?? null}
        liveTrips={new Set(group?.liveTripIds)}
        chip={chip}
        filters={filters}
        onFilters={updateFilters}
        onJustMe={() => {
          setPicked({});
          updateFilters({});
        }}
      />
    </ScopeNotices>
  );
}

function GroupChip({
  groups,
  groupId,
  fallbackName,
  onChange,
}: {
  groups: ReadonlyArray<GroupListItem>;
  groupId: GroupId | null;
  fallbackName: string | null;
  onChange: (groupId: GroupId | null) => void;
}) {
  const list = groups.map((item) => ({ id: item.group.id, name: item.group.name }));

  const items =
    groupId !== null && !list.some((item) => item.id === groupId)
      ? [...list, { id: groupId, name: fallbackName ?? "Group" }]
      : list;

  const chip = groupChip(items, groupId);

  if (Platform.OS === "android")
    return (
      <AndroidGroupChip
        {...chip}
        options={chip.options.map((option) => {
          const group = groups.find((item) => item.group.id === option.value);

          return {
            ...option,
            icon: option.value === "" ? "person" : "group",
            subtitle:
              option.value === ""
                ? "All your recorded play"
                : group?.liveSessionCount
                  ? "Live now"
                  : group
                    ? `${group.trips.length} ${group.trips.length === 1 ? "trip" : "trips"}`
                    : "Saved group",
          };
        })}
        onChange={(value) => onChange(value === "" ? null : GroupId.make(value))}
        onClear={() => onChange(null)}
      />
    );

  return (
    <FilterChip
      name={chip.name}
      options={chip.options}
      value={chip.value}
      applied={chip.applied}
      onChange={(value) => onChange(value === "" ? null : GroupId.make(value))}
      onClear={() => onChange(null)}
    />
  );
}

function JustMe({
  names,
  trips,
  chip,
  filters,
  onFilters,
}: {
  names: ReturnType<typeof tripNames>;
  trips: ReadonlyArray<Trip>;
  chip: ReactNode;
  filters: StatsFilters;
  onFilters: (filters: StatsFilters) => void;
}) {
  const { home, status, error, retryLoad } = useRecordingHome();
  const [adding, setAdding] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const android = Platform.OS === "android";

  const liveTrips = new Set(
    home?.active.flatMap(({ table }) => (table.tripId ? [table.tripId] : [])),
  );

  const view = useMemo(
    () =>
      home
        ? personalStatsView([...home.active, ...home.finished], filters, {
            tripNames: names,
            trips,
          })
        : null,
    [home, filters, names, trips],
  );

  const filterRow =
    view && view.kind !== "empty" ? (
      <Filters
        lead={chip}
        chips={view.chips}
        filtered={view.filtered}
        onChange={onFilters}
        trips={view.trips}
        liveTrips={liveTrips}
        gameMenu={android ? { open: gameOpen, setOpen: setGameOpen } : undefined}
      />
    ) : chip ? (
      <Filters lead={chip} chips={[]} filtered={false} onChange={onFilters} />
    ) : null;

  return (
    <StatsContent filters={filterRow}>
      {status === "load_failed" ? (
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      ) : null}
      {view === null ? (
        status === "load_failed" ? null : (
          <StatsSkeleton chips={!android} />
        )
      ) : view.kind === "empty" ? (
        android ? (
          <AndroidStatsEmpty
            icon="stats"
            title="Your stats start here"
            body="Add a finished session to see your result, hours and games here."
            button="Add a past session"
            onPress={() => setAdding(true)}
            note={"No account or internet connection needed.\nYour recordings stay on this phone."}
          />
        ) : (
          <View className="gap-3">
            <EmptyState
              centered
              title="Your stats start here"
              action={
                <View className="gap-2 self-stretch">
                  <EmptyChartGrid />
                  <Button
                    label="Add a past session"
                    variant="primary"
                    size="lg"
                    onPress={() => setAdding(true)}
                  />
                </View>
              }
            >
              Add a finished session to see your result, hours and games here.
            </EmptyState>
            <Text className="text-center type-footnote text-muted">
              No account or internet connection needed. Your sessions are saved on this phone.
            </Text>
          </View>
        )
      ) : view.kind === "no_match" ? (
        android ? (
          <AndroidStatsEmpty
            icon="search"
            title="No matching sessions"
            body={view.sentence}
            button="Reset all filters"
            onPress={() => onFilters({})}
            extra={
              <Button
                label="Change game"
                variant="ghost"
                size="sm"
                className="mt-2"
                onPress={() => setGameOpen(true)}
              />
            }
          />
        ) : (
          <EmptyState
            centered
            title="No matching sessions"
            action={
              <Button
                label="Reset all filters"
                variant="primary"
                size="lg"
                className="mt-2 self-stretch"
                onPress={() => onFilters({})}
              />
            }
          >
            {view.sentence}
          </EmptyState>
        )
      ) : (
        <Breakdown view={view} onFilter={onFilters} />
      )}
      {adding ? (
        <PastSessionSheet onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
      ) : null}
    </StatsContent>
  );
}

function Breakdown({
  view,
  onFilter,
}: {
  view: StatsSummary;
  onFilter: (filters: StatsFilters) => void;
}) {
  const navigation = useNavigation();
  const android = Platform.OS === "android";
  const trip = view.chips.find((chip) => chip.key === "tripId" && chip.applied);
  const range = trip && view.trips.byId.get(trip.value)?.range;

  return (
    <>
      {android && range ? (
        <Text className="px-1 type-footnote text-muted">{range} · Whole trip</Text>
      ) : null}
      <StatsHero view={view} />
      <MoneySection money={view.money} />
      {view.bars ? <PeriodSection bars={view.bars} /> : null}
      {view.patterns.length > 0 ? <PatternsSection patterns={view.patterns} /> : null}
      {view.records.length > 0 ? (
        <RecordsSection
          records={view.records}
          onOpen={(visitId) => navigation.navigate("Play", { visitId })}
        />
      ) : null}
      {view.byGame ? (
        <ByGame rows={view.byGame} currency={RECORDING_CURRENCY} onFilter={onFilter} />
      ) : null}
      {view.byCasino ? (
        <ByCasino
          rows={view.byCasino}
          currency={RECORDING_CURRENCY}
          line={view.casinosLine}
          liveCasino={view.liveCasino}
          onFilter={onFilter}
        />
      ) : null}
    </>
  );
}

function EmptyChartGrid() {
  const rule = String(useCSSVariable("--color-fill-strong"));

  return (
    <Svg width="100%" height={72} accessibilityElementsHidden importantForAccessibility="no">
      {[12, 36, 60].map((y) => (
        <Line
          key={y}
          x1={0}
          x2="100%"
          y1={y}
          y2={y}
          stroke={rule}
          strokeLinecap="round"
          strokeDasharray="0.3 3.5"
        />
      ))}
    </Svg>
  );
}
