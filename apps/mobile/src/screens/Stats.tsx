import type { StaticScreenProps } from "@react-navigation/native";
import type { StatsPick } from "../lib/go";
import { runningLine } from "@stacks/client-runtime/chart";
import { useRecordingHome } from "@stacks/client-runtime/recordingReact";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import {
  personalStatsView,
  TOP_CASINOS,
  type GameChip,
  type PersonalStatsView,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { MinorUnits, type TripId } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
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
import { Icon } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { EmptyState, List, Row, SectionHeading, Skeleton } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";
import { PersonalScreen, SaveStatus } from "../features/Personal";
import { PastSessionSheet } from "../features/RecordingForms";
import { TripNames } from "../features/TableTrip";

type Shown = Exclude<PersonalStatsView, { kind: "empty" }>;
type Summary = Extract<PersonalStatsView, { kind: "stats" }>;

const chipColor: Record<GameChip, string> = {
  red: "bg-chip-red",
  blue: "bg-chip-blue",
  green: "bg-chip-green",
  black: "bg-chip-black",
  purple: "bg-chip-purple",
  orange: "bg-chip-orange",
  grey: "bg-chip-grey",
};

const signed = (amount: number) =>
  formatMoney(MinorUnits.make(amount), RECORDING_CURRENCY, { signDisplay: "exceptZero" });

/**
 * Your own play, broken down, from this device's sessions: it works signed out and offline. A trip
 * or group page opens it with that group (and trip) picked.
 */
export function StatsScreen(_props: StaticScreenProps<StatsPick | undefined>) {
  return <TripNames>{(tripNames) => <StatsView tripNames={tripNames} />}</TripNames>;
}

function StatsView({ tripNames }: { tripNames: ReadonlyMap<TripId, string> }) {
  const { home, status, error, retryLoad } = useRecordingHome();
  const [filters, setFilters] = useState<StatsFilters>({});
  const [adding, setAdding] = useState(false);
  const view = useMemo(
    () =>
      home ? personalStatsView([...home.active, ...home.finished], filters, { tripNames }) : null,
    [home, filters, tripNames],
  );
  return (
    <PersonalScreen live>
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
      ) : (
        <>
          <Filters view={view} onChange={setFilters} />
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
                  onPress={() => setFilters({})}
                />
              }
            >
              {view.sentence}
            </EmptyState>
          ) : (
            <Breakdown view={view} onFilter={setFilters} />
          )}
        </>
      )}
      {adding ? (
        <PastSessionSheet onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
      ) : null}
    </PersonalScreen>
  );
}

function Filters({ view, onChange }: { view: Shown; onChange: (filters: StatsFilters) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Stats filters"
      className="-mx-4"
      contentContainerClassName="items-center gap-2 px-4"
    >
      {view.chips.map((chip) => (
        <FilterChip
          key={chip.key}
          name={chip.name}
          options={chip.options}
          value={chip.value}
          applied={chip.applied}
          onChange={(value) =>
            onChange(chip.options.find((option) => option.value === value)!.filters)
          }
          onClear={() => onChange(chip.cleared)}
        />
      ))}
      {view.filtered ? (
        <Button label="Reset all" variant="ghost" size="sm" onPress={() => onChange({})} />
      ) : null}
    </ScrollView>
  );
}

function Breakdown({
  view,
  onFilter,
}: {
  view: Summary;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [casinos, setCasinos] = useState(false);
  return (
    <>
      <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
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
                  className="font-semibold"
                />
              </Row>
            ))}
          </List>
        </View>
      ) : null}
      {view.byGame ? (
        <View className="gap-2">
          <SectionHeading>By game</SectionHeading>
          <List>
            {view.byGame.map((row) => (
              <Row
                key={row.key}
                onPress={() => onFilter(row.filters)}
                accessibilityLabel={`${row.label}, ${row.meta}, ${signed(row.result)}`}
                accessibilityHint={`Shows only ${row.label}`}
              >
                <View className={cn("size-2 rounded-full", chipColor[row.chip])} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text numberOfLines={1} className="type-heading text-ink">
                    {row.label}
                  </Text>
                  <Text numberOfLines={1} className="type-footnote text-muted">
                    {row.meta}
                  </Text>
                </View>
                <View className="h-1.5 w-10 overflow-hidden rounded-full bg-fill">
                  <View
                    className={cn("h-full rounded-full", row.result < 0 ? "bg-loss" : "bg-win")}
                    style={{ width: `${row.share * 100}%` }}
                  />
                </View>
                <Money
                  amount={row.result}
                  currency={RECORDING_CURRENCY}
                  tone="result"
                  className="min-w-18 text-right font-semibold"
                />
              </Row>
            ))}
          </List>
        </View>
      ) : null}
      {view.byCasino ? (
        <View className="gap-2">
          <SectionHeading
            action={
              view.byCasino.length > TOP_CASINOS ? (
                <Button
                  label="See all"
                  variant="ghost"
                  size="sm"
                  onPress={() => setCasinos(true)}
                />
              ) : undefined
            }
          >
            By casino
          </SectionHeading>
          <CasinoRows rows={view.byCasino.slice(0, TOP_CASINOS)} onFilter={onFilter} />
          {casinos ? (
            <Sheet
              open
              title="Casinos"
              description={view.casinosLine}
              onClose={() => setCasinos(false)}
            >
              <View className="gap-2">
                <View className="flex-row justify-between px-4">
                  <Text className="type-footnote text-muted">Most played first</Text>
                  <Text className="type-footnote text-muted">Result</Text>
                </View>
                <CasinoRows
                  rows={view.byCasino}
                  onFilter={(filters) => {
                    setCasinos(false);
                    onFilter(filters);
                  }}
                />
              </View>
            </Sheet>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function CasinoRows({
  rows,
  onFilter,
}: {
  rows: NonNullable<Summary["byCasino"]>;
  onFilter: (filters: StatsFilters) => void;
}) {
  return (
    <List>
      {rows.map((row) => (
        <Row
          key={row.key}
          onPress={() => onFilter(row.filters)}
          accessibilityLabel={`${row.label}, ${row.meta}, ${signed(row.result)}`}
          accessibilityHint="Shows only this casino"
        >
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="type-heading text-ink">
              {row.label}
            </Text>
            <Text className="type-footnote text-muted">{row.meta}</Text>
          </View>
          <Money
            amount={row.result}
            currency={RECORDING_CURRENCY}
            tone="result"
            className="font-semibold"
          />
          <Icon name="chevron-right" color="faint" size={16} />
        </Row>
      ))}
    </List>
  );
}

function Figure({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <View className="w-1/2 min-w-0 gap-1 pr-2">
      <Text className="type-label text-muted">{label}</Text>
      {children}
      {sub ? <Text className="type-label text-muted">{sub}</Text> : null}
    </View>
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
            ? `${shown.day}, session ${signed(shown.result)}, running ${signed(shown.total)}`
            : signed(total),
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
