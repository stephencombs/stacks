import { useAtomValue } from "@effect/atom-react";
import type { StaticScreenProps } from "@react-navigation/native";
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
import { GroupId, TripId, type GroupListItem } from "@stacks/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
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
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { GroupStatsView } from "../features/GroupStats";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet } from "../features/RecordingForms";
import { ByCasino, ByGame, Figure, Filters, chipColor, signed } from "../features/StatsParts";
import { useAccount } from "../lib/account";
import { StacksProvider, useStacks, useStatsCopies } from "../lib/stacks";

type Summary = Extract<PersonalStatsView, { kind: "stats" }>;

/** The group, and maybe trip, Stats opens on: from a trip or group's Stats, or an old Board link. */
type Props = StaticScreenProps<{ groupId?: string; tripId?: string } | undefined>;

/**
 * Your own play, broken down, from this device's sessions: it works signed out and offline.
 * Signed in, the Group chip switches the screen to one of your groups.
 */
export function StatsScreen({ route }: Props) {
  const pick = {
    ...(route.params?.groupId ? { groupId: GroupId.make(route.params.groupId) } : {}),
    ...(route.params?.tripId ? { tripId: TripId.make(route.params.tripId) } : {}),
  };
  return (
    <PersonalScreen live>
      <YourGroups>
        {(groups) => (
          // Each arrival with a group picked starts fresh, even when Stats is already open.
          <StatsView key={`${pick.groupId}:${pick.tripId}`} pick={pick} groups={groups} />
        )}
      </YourGroups>
    </PersonalScreen>
  );
}

type Pick = { readonly groupId?: GroupId; readonly tripId?: TripId };

const noGroups: ReadonlyArray<GroupListItem> = [];
const remembered = new WeakSet<object>();

/** Your groups when you're signed in; signed out, or before they load, there are none. */
function YourGroups({
  children,
}: {
  children: (groups: ReadonlyArray<GroupListItem>) => ReactNode;
}) {
  const account = useAccount();
  if (!account.available || !account.isSignedIn || !account.userId) return children(noGroups);
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
  // A trip alone names its group once your groups have loaded, or from the phone's index offline.
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
          // A trip stays picked only in the group it belongs to.
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
  return groupId === null ? (
    <JustMe names={tripNames(groups)} chip={chip} filters={filters} onFilters={setFilters} />
  ) : (
    <GroupStatsView
      key={groupId}
      groupId={groupId}
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
  chip,
  filters,
  onFilters,
}: {
  names: ReturnType<typeof tripNames>;
  chip: ReactNode;
  filters: StatsFilters;
  onFilters: (filters: StatsFilters) => void;
}) {
  const { home, status, error, retryLoad } = useRecordingHome();
  const [adding, setAdding] = useState(false);
  const view = useMemo(
    () =>
      home
        ? personalStatsView([...home.active, ...home.finished], filters, { tripNames: names })
        : null,
    [home, filters, names],
  );
  return (
    <>
      {status === "load_failed" ? (
        <SaveStatus status={status} error={error} onRetry={retryLoad} />
      ) : null}
      {view === null ? (
        status === "load_failed" ? null : (
          <View className="gap-6">
            <View className="flex-row gap-2">
              <Skeleton className="h-11 w-24 rounded-full" />
              <Skeleton className="h-11 w-28 rounded-full" />
            </View>
            <Skeleton className="h-72 w-full rounded-2xl" />
          </View>
        )
      ) : view.kind === "empty" ? (
        <>
          {chip ? <Filters lead={chip} chips={[]} filtered={false} onChange={onFilters} /> : null}
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
        </>
      ) : (
        <>
          <Filters lead={chip} chips={view.chips} filtered={view.filtered} onChange={onFilters} />
          {view.kind === "no_match" ? (
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
          ) : (
            <Breakdown view={view} onFilter={onFilters} />
          )}
        </>
      )}
      {adding ? (
        <PastSessionSheet onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
      ) : null}
    </>
  );
}

function Breakdown({
  view,
  onFilter,
}: {
  view: Summary;
  onFilter: (filters: StatsFilters) => void;
}) {
  return (
    <>
      <View className="gap-2 rounded-[22px] bg-surface p-4">
        <Text className="type-label text-muted">{view.title}</Text>
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
        <View className="mt-4 flex-row flex-wrap gap-y-4">
          <Figure label="Sessions">
            <Text className="type-heading text-ink">{view.sessions}</Text>
          </Figure>
          <Figure label="Hours">
            <Text className="type-heading text-ink">{view.hours}</Text>
          </Figure>
          <Figure label="Per hour">
            <Money
              amount={view.hourlyResult}
              currency={RECORDING_CURRENCY}
              tone="result"
              className="text-[17px] font-semibold"
            />
          </Figure>
          <Figure label="Win rate" sub={view.winRateLine}>
            <Text className="type-heading text-ink">{view.winRate}</Text>
          </Figure>
        </View>
      </View>
      {view.list ? (
        <View className="gap-2">
          <SectionHeading count={view.list.length}>
            {view.filtered ? "Matching sessions" : "Sessions"}
          </SectionHeading>
          <List>
            {view.list.map((row) => (
              <Row key={row.key}>
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
              </Row>
            ))}
          </List>
        </View>
      ) : null}
      {view.byGame ? (
        <ByGame rows={view.byGame} currency={RECORDING_CURRENCY} onFilter={onFilter} />
      ) : null}
      {view.byCasino ? (
        <ByCasino
          rows={view.byCasino}
          currency={RECORDING_CURRENCY}
          line={view.casinosLine}
          onFilter={onFilter}
        />
      ) : null}
    </>
  );
}

const HEIGHT = 64;
const PAD = { x: 6, y: 6 };
const CALLOUT = 196;

/** The running result against time, from break-even. Dragging along it reads one session. */
function RunningChart({ chart }: { chart: NonNullable<Summary["chart"]> }) {
  const [win, loss, winTint, lossTint, rule, surface, muted] = useCSSVariable([
    "--color-win",
    "--color-loss",
    "--color-win-tint",
    "--color-loss-tint",
    "--color-fill-strong",
    "--color-surface",
    "--color-muted",
  ]).map(String);
  const [width, setWidth] = useState(0);
  const [inspect, setInspect] = useState<number | null>(null);
  const { points } = chart;
  const last = points.length - 1;
  const plot = runningLine(points, { width, height: HEIGHT }, PAD);
  const shown = inspect === null ? null : points[inspect]!;
  const dot = plot.points[inspect ?? last];
  const total = (shown ?? points[last]!).total;
  const step = (by: number) => setInspect(Math.min(last, Math.max(0, (inspect ?? last) + by)));
  const callout =
    dot && shown
      ? Math.min(
          Math.max(0, dot.x < width / 2 ? dot.x + 12 : dot.x - 12 - CALLOUT),
          Math.max(0, width - CALLOUT),
        )
      : 0;
  return (
    <View className="mt-2 gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="type-footnote text-muted">Running result</Text>
        <Text
          accessibilityRole="button"
          onPress={() => setInspect(inspect === null ? last : null)}
          suppressHighlighting
          className="-my-3 py-3 type-footnote text-muted"
        >
          {inspect === null ? "Drag to inspect" : "Done"}
        </Text>
      </View>
      <View
        style={{ height: HEIGHT }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Running result by finished session"
        accessibilityValue={{
          text: shown
            ? `${shown.day}, session ${signed(shown.result, RECORDING_CURRENCY)}, running ${signed(shown.total, RECORDING_CURRENCY)}`
            : signed(total, RECORDING_CURRENCY),
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          step(event.nativeEvent.actionName === "increment" ? 1 : -1)
        }
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => setInspect(plot.nearest(event.nativeEvent.locationX))}
        onResponderMove={(event) => setInspect(plot.nearest(event.nativeEvent.locationX))}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT} pointerEvents="none">
            <Defs>
              <ClipPath id="up">
                <Rect x={-8} y={-8} width={width + 16} height={plot.zero + 8} />
              </ClipPath>
              <ClipPath id="down">
                <Rect x={-8} y={plot.zero} width={width + 16} height={HEIGHT - plot.zero + 8} />
              </ClipPath>
            </Defs>
            <Path d={plot.area} fill={winTint} clipPath="url(#up)" />
            <Path d={plot.area} fill={lossTint} clipPath="url(#down)" />
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
              stroke={win}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath="url(#up)"
            />
            <Polyline
              points={plot.line}
              fill="none"
              stroke={loss}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath="url(#down)"
            />
            <SvgText x={width - 3} y={plot.zero - 5} textAnchor="end" fontSize={12} fill={muted}>
              Even
            </SvgText>
            {shown && dot ? (
              <Line x1={dot.x} x2={dot.x} y1={0} y2={HEIGHT} stroke={muted} strokeDasharray="3 3" />
            ) : null}
            {dot ? (
              <Circle
                cx={dot.x}
                cy={dot.y}
                r={4}
                fill={total < 0 ? loss : win}
                stroke={surface}
                strokeWidth={2}
              />
            ) : null}
          </Svg>
        ) : null}
        {shown ? (
          <View
            pointerEvents="none"
            className="absolute top-0 gap-1 rounded-xl border border-line bg-surface px-3 py-2"
            style={{ left: callout, width: CALLOUT }}
          >
            <Text className="type-footnote font-semibold text-ink">{shown.day}</Text>
            <View className="flex-row justify-between gap-3">
              <Text className="type-label text-muted">Running</Text>
              <Money
                amount={shown.total}
                currency={RECORDING_CURRENCY}
                tone="result"
                className="text-xs font-semibold"
              />
            </View>
            <View className="flex-row justify-between gap-3">
              <Text className="type-label text-muted">That session</Text>
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
        <Text className="type-label text-muted">{chart.from}</Text>
        <Text className="type-label text-muted">{chart.to}</Text>
      </View>
    </View>
  );
}
