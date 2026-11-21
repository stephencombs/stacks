import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { runningLine } from "@stacks/client-runtime/chart";
import { groupChip } from "@stacks/client-runtime/groupStats";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import {
  personalStatsView,
  type PersonalStatsView,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { tripNames } from "@stacks/client-runtime/trip";
import { GroupId, TripId, VisitId, type GroupListItem, type Trip } from "@stacks/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { PanResponder, Platform, Pressable, Text, View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Line,
  Path,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FilterChip } from "../components/ui/FilterChip";
import { EmptyState, List, Row, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { Icon } from "../components/ui/Icon";
import { GroupStatsView } from "../features/GroupStats";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet } from "../features/RecordingForms";
import { chipColor } from "../features/chipColor";
import {
  AndroidGroupChip,
  AndroidStatsEmpty,
  ByCasino,
  ByGame,
  Figure,
  Filters,
  StatsContent,
  StatsHeading,
  signed,
} from "../features/StatsParts";
import { useAccount } from "../lib/account";
import { usePreferences } from "../lib/preferences";
import { StacksProvider, useStacks, useStatsCopies } from "../lib/stacks";

type Summary = Extract<PersonalStatsView, { kind: "stats" }>;

/** The group, and maybe trip, Stats opens on: from a trip or group's Stats, or an old Board link. */
type Props = StaticScreenProps<{ groupId?: string; tripId?: string } | undefined>;

/**
 * Your own play, broken down, from this device's sessions: it works signed out and offline.
 * Signed in, the Group chip switches the screen to one of your groups.
 */
export function StatsScreen({ route }: Props) {
  const navigation = useNavigation();
  const android = Platform.OS === "android";
  useLayoutEffect(() => {
    if (android) navigation.setOptions({ headerShown: false });
  }, [android, navigation]);

  const pick = {
    ...(route.params?.groupId ? { groupId: GroupId.make(route.params.groupId) } : null),
    ...(route.params?.tripId ? { tripId: TripId.make(route.params.tripId) } : null),
  };

  const stats = (
    <YourGroups>
      {(groups) => (
        <StatsView
          key={`${pick.groupId}:${pick.tripId}`}
          pick={groups ? pick : justMe}
          groups={groups ?? noGroups}
        />
      )}
    </YourGroups>
  );

  return android ? stats : <PersonalScreen live>{stats}</PersonalScreen>;
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

function StatsView({ pick, groups }: { pick: Pick; groups: ReadonlyArray<GroupListItem> }) {
  const copies = useStatsCopies();
  const [picked, setPicked] = useState<Pick>(pick);
  const [filters, setFilters] = useState<StatsFilters>(pick.tripId ? { tripId: pick.tripId } : {});
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
      onFilters={setFilters}
    />
  ) : (
    <GroupStatsView
      key={groupId}
      groupId={groupId}
      groupName={group?.group.name ?? fallbackName ?? "This group"}
      currentTripId={group?.currentTripId ?? null}
      liveTrips={new Set(group?.liveTripIds)}
      chip={chip}
      filters={filters}
      onFilters={setFilters}
      onJustMe={() => {
        setPicked({});
        setFilters({});
      }}
    />
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
          <View className="gap-6">
            {android ? null : (
              <View className="flex-row gap-2">
                <Skeleton className="h-11 w-24 rounded-full" />
                <Skeleton className="h-11 w-28 rounded-full" />
              </View>
            )}
            <Skeleton className="h-72 w-full rounded-2xl" />
          </View>
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
                <Button
                  label="Add a past session"
                  variant="primary"
                  size="lg"
                  className="mt-2 self-stretch"
                  onPress={() => setAdding(true)}
                />
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
  view: Summary;
  onFilter: (filters: StatsFilters) => void;
}) {
  const navigation = useNavigation();
  const android = Platform.OS === "android";
  const [info, setInfo] = useState(false);
  const muted = String(useCSSVariable("--color-muted"));
  const trip = view.chips.find((chip) => chip.key === "tripId" && chip.applied);
  const range = trip && view.trips.byId.get(trip.value)?.range;

  const numbers = (
    <View className={android ? "mt-2 flex-row" : "mt-4 flex-row flex-wrap gap-y-4"}>
      <Figure label="Sessions" compact={android}>
        <Text className="type-heading text-ink">{view.sessions}</Text>
      </Figure>
      <Figure label="Hours" compact={android}>
        <Text className="type-heading text-ink">{view.hours}</Text>
      </Figure>
      <Figure label="Per hour" compact={android}>
        <Money
          amount={view.hourlyResult}
          currency={RECORDING_CURRENCY}
          tone="result"
          fit={android}
          className="text-[17px] font-semibold"
        />
      </Figure>
      <Figure label="Win rate" compact={android} sub={view.winRateLine}>
        <Text className="type-heading text-ink">{view.winRate}</Text>
      </Figure>
    </View>
  );

  const sessions = view.list ? (
    <View className="gap-2">
      <StatsHeading count={android ? `${view.list.length} finished` : String(view.list.length)}>
        {view.filtered ? "Matching sessions" : "Sessions"}
      </StatsHeading>
      <List>
        {view.list.map((row) => (
          <Row
            key={row.key}
            onPress={() => navigation.navigate("Play", { visitId: VisitId.make(row.key) })}
            className={android ? "gap-2.5 py-2.5" : undefined}
          >
            <View className={cn("w-1 self-stretch rounded-full", chipColor[row.chip])} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text numberOfLines={1} className="type-heading text-ink">
                {row.title}
              </Text>
              <Text className="type-footnote text-muted">{row.meta}</Text>
            </View>
            <Money
              amount={row.result}
              currency={RECORDING_CURRENCY}
              tone="result"
              className="type-number"
            />
            <Icon name="chevron-right" color="faint" size={18} />
          </Row>
        ))}
      </List>
    </View>
  ) : null;

  return (
    <>
      {android && range ? (
        <Text className="px-1 type-footnote text-muted">{range} · Whole trip</Text>
      ) : null}
      <View className={cn("rounded-[22px] bg-surface p-4", android ? "gap-1" : "gap-2")}>
        <Text className={cn("type-label text-muted", android && "pr-8")}>{view.title}</Text>
        {android ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About your result"
            accessibilityState={{ expanded: info }}
            hitSlop={8}
            className="absolute top-1 right-2 size-9 items-center justify-center"
            onPress={() => setInfo(!info)}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" importantForAccessibility="no">
              <Path
                fill={muted}
                d="M11 17h2v-6h-2zm1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16M11 9h2V7h-2z"
              />
            </Svg>
          </Pressable>
        ) : null}
        <Money
          amount={view.result}
          currency={RECORDING_CURRENCY}
          tone="result"
          fit
          className="type-hero"
        />
        {view.chart ? (
          <RunningChart
            key={view.chart.points.map((point) => point.sessionId).join(",")}
            chart={view.chart}
          />
        ) : null}
        {numbers}
        {android && info ? (
          <View className="mt-2 rounded-lg bg-fill px-3 py-2" accessibilityLiveRegion="polite">
            <Text className="type-footnote text-ink">
              Result is what you cashed out minus what you bought in for across your finished
              sessions.
            </Text>
          </View>
        ) : null}
      </View>
      {android ? null : sessions}
      {view.byGame ? (
        <ByGame rows={view.byGame} currency={RECORDING_CURRENCY} onFilter={onFilter} />
      ) : null}
      {android ? sessions : null}
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

const HEIGHT = 64;
const PAD = { x: 6, y: 6 };
const CALLOUT = 196;

function RunningChart({ chart }: { chart: NonNullable<Summary["chart"]> }) {
  const android = Platform.OS === "android";
  const height = android ? 84 : HEIGHT;

  const [win, loss, winTint, lossTint, rule, surface, muted, fill] = useCSSVariable([
    "--color-win",
    "--color-loss",
    "--color-win-tint",
    "--color-loss-tint",
    "--color-fill-strong",
    "--color-surface",
    "--color-muted",
    "--color-fill",
  ]).map(String);

  const prefs = usePreferences();
  const [width, setWidth] = useState(0);
  const [inspect, setInspect] = useState<number | null>(null);
  const { points } = chart;
  const last = points.length - 1;
  const plot = runningLine(points, { width, height }, PAD);
  const up = prefs.privacyMode ? muted : win;
  const down = prefs.privacyMode ? muted : loss;
  const axis = android ? chart.androidAxis : chart;
  const calloutWidth = android ? Math.min(190, width) : CALLOUT;

  const drag = android
    ? PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event) => setInspect(plot.nearest(event.nativeEvent.locationX)),
        onPanResponderMove: (event) => setInspect(plot.nearest(event.nativeEvent.locationX)),
      }).panHandlers
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: (event: import("react-native").GestureResponderEvent) =>
          setInspect(plot.nearest(event.nativeEvent.locationX)),
        onResponderMove: (event: import("react-native").GestureResponderEvent) =>
          setInspect(plot.nearest(event.nativeEvent.locationX)),
      };

  const shown = inspect === null ? null : points[inspect]!;
  const dot = plot.points[inspect ?? last];
  const total = (shown ?? points[last]!).total;
  const step = (by: number) => setInspect(Math.min(last, Math.max(0, (inspect ?? last) + by)));

  const callout =
    dot && shown
      ? Math.min(
          Math.max(0, dot.x < width / 2 ? dot.x + 12 : dot.x - 12 - calloutWidth),
          Math.max(0, width - calloutWidth),
        )
      : 0;

  return (
    <View className={android ? "mt-3 gap-1" : "mt-2 gap-1"}>
      <View className="flex-row items-center justify-between">
        <Text className="type-footnote text-muted">Running result</Text>
        <Text
          accessibilityRole="button"
          onPress={() => setInspect(inspect === null ? last : null)}
          suppressHighlighting
          className={cn(
            "-my-3 py-3 type-footnote",
            android ? "font-semibold text-ink" : "text-muted",
          )}
        >
          {inspect === null ? "Drag to inspect" : "Done"}
        </Text>
      </View>
      <View
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Running result by finished session"
        accessibilityValue={{
          text: shown
            ? `${shown.day}, session ${signed(shown.result, RECORDING_CURRENCY, prefs, true)}, running ${signed(shown.total, RECORDING_CURRENCY, prefs, true)}`
            : signed(total, RECORDING_CURRENCY, prefs, true),
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          step(event.nativeEvent.actionName === "increment" ? 1 : -1)
        }
        {...drag}
      >
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              <ClipPath id="up">
                <Rect x={-8} y={-8} width={width + 16} height={plot.zero + 8} />
              </ClipPath>
              <ClipPath id="down">
                <Rect x={-8} y={plot.zero} width={width + 16} height={height - plot.zero + 8} />
              </ClipPath>
            </Defs>
            <Path d={plot.area} fill={prefs.privacyMode ? fill : winTint} clipPath="url(#up)" />
            <Path d={plot.area} fill={prefs.privacyMode ? fill : lossTint} clipPath="url(#down)" />
            <Line
              x1={0}
              x2={width}
              y1={plot.zero}
              y2={plot.zero}
              stroke={rule}
              strokeDasharray="3 4"
            />
            <Polyline
              points={plot.line}
              fill="none"
              stroke={up}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath="url(#up)"
            />
            <Polyline
              points={plot.line}
              fill="none"
              stroke={down}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath="url(#down)"
            />
            <SvgText x={width - 3} y={plot.zero - 5} textAnchor="end" fontSize={12} fill={muted}>
              Even
            </SvgText>
            {shown && dot ? (
              <Line x1={dot.x} x2={dot.x} y1={0} y2={height} stroke={muted} strokeDasharray="3 3" />
            ) : null}
            {dot ? (
              <Circle
                cx={dot.x}
                cy={dot.y}
                r={4}
                fill={total < 0 ? down : up}
                stroke={surface}
                strokeWidth={2}
              />
            ) : null}
          </Svg>
        ) : null}
        {shown ? (
          <View
            pointerEvents="none"
            className={cn(
              "absolute gap-1 rounded-xl px-3 py-2",
              android ? "bg-surface shadow-md dark:bg-fill" : "border border-line bg-surface",
            )}
            style={{ left: callout, top: android ? 2 : 0, width: calloutWidth }}
          >
            <Text className="type-footnote font-semibold text-ink">{shown.day}</Text>
            <View className="flex-row justify-between gap-3">
              <Text className={android ? "type-footnote text-muted" : "type-label text-muted"}>
                Running
              </Text>
              <Money
                amount={shown.total}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="text-xs font-semibold"
              />
            </View>
            <View className="flex-row justify-between gap-3">
              <Text className={android ? "type-footnote text-muted" : "type-label text-muted"}>
                That session
              </Text>
              <Money
                amount={shown.result}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="text-xs font-semibold"
              />
            </View>
          </View>
        ) : null}
      </View>
      <View className="flex-row justify-between">
        <Text className={android ? "type-footnote text-muted" : "type-label text-muted"}>
          {axis.from}
        </Text>
        {android && chart.androidAxis.middle ? (
          <Text className="type-footnote text-muted">{chart.androidAxis.middle}</Text>
        ) : null}
        <Text className={android ? "type-footnote text-muted" : "type-label text-muted"}>
          {axis.to}
        </Text>
      </View>
    </View>
  );
}
