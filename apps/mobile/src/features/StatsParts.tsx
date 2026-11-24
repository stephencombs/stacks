import { barTrack } from "@stacks/client-runtime/chart";
import {
  TOP_CASINOS,
  finishedSessions,
  type GameChip,
  type StatsTrips,
  type StatsChip,
  type StatsFilters,
} from "@stacks/client-runtime/stats";
import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { useState, type ReactNode } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Button } from "../components/ui/Button";
import { FilterChip } from "../components/ui/FilterChip";
import { Icon, type IconName } from "../components/ui/Icon";
import { Sheet } from "../components/ui/Sheet";
import { List, Row, SectionHeading } from "../components/ui/Surface";
import { useScreenFoot } from "../components/ui/tabBar";
import { cn } from "../components/ui/cn";
import { useLargeText } from "../lib/useLargeText";
import { formatDisplayMoney, usePreferences, type DevicePreferences } from "../lib/preferences";

import { FeltStatusBar } from "./FeltStatusBar";
import { PersonalLiveBar } from "./LiveBar";
import { PersonalYouButton } from "./Personal";
import { chipColor } from "./chipColor";

import { StatsChipTrigger, StatsMenu, StatsRadio } from "./StatsMenus.android";

export { StatsMenu as AndroidGroupChip };

export function StatsContent({ filters, children }: { filters?: ReactNode; children?: ReactNode }) {
  if (Platform.OS !== "android")
    return (
      <>
        {filters}
        {children}
      </>
    );

  return <AndroidStatsContent filters={filters}>{children}</AndroidStatsContent>;
}

function AndroidStatsContent({ filters, children }: { filters?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const foot = useScreenFoot();
  const [scrolled, setScrolled] = useState(false);

  return (
    <View className="flex-1 bg-canvas">
      <FeltStatusBar felt={false} />
      <View
        testID="stats-filter-bar"
        className={cn("flex-row items-center gap-1 pb-2", scrolled ? "bg-surface" : "bg-canvas")}
        style={{
          paddingTop: insets.top + 10,
          paddingLeft: insets.left,
          paddingRight: Math.max(12, insets.right),
        }}
      >
        <View className="min-w-0 flex-1">{filters}</View>
        <PersonalYouButton />
      </View>
      <ScrollView
        testID="stats-content"
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        style={foot.scrollStyle}
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={16}
        onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y > 0)}
        contentContainerClassName="gap-4 pt-2 pb-5"
        contentContainerStyle={{
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
        }}
      >
        {children}
        {foot.endSpace > 0 ? <View style={{ height: foot.endSpace }} /> : null}
      </ScrollView>
      <PersonalLiveBar
        onHeightChange={foot.onLiveBarHeight}
        {...(foot.above === undefined ? {} : { bottom: foot.above })}
      />
    </View>
  );
}

export function StatsHeading({
  children,
  count,
  action,
}: {
  children: string;
  count?: string;
  action?: ReactNode;
}) {
  const large = useLargeText();

  return Platform.OS === "android" ? (
    <View
      className={cn(
        "min-h-5 flex-row items-center justify-between gap-2 px-1",
        large && "flex-wrap",
      )}
    >
      <Text accessibilityRole="header" className={cn("type-label text-muted", !large && "flex-1")}>
        {children.toUpperCase()}
      </Text>
      {count ? <Text className="type-footnote text-muted">{count}</Text> : null}
      {action}
    </View>
  ) : (
    <SectionHeading count={count} action={action}>
      {children}
    </SectionHeading>
  );
}

export function AndroidStatsEmpty({
  icon,
  title,
  body,
  button,
  onPress,
  note,
  extra,
}: {
  icon: IconName;
  title: string;
  body: string;
  button: string;
  onPress: () => void;
  note?: string;
  extra?: ReactNode;
}) {
  return (
    <View className="items-center px-1 pt-26">
      <Icon name={icon} color="muted" size={28} />
      <Text accessibilityRole="header" className="mt-5 text-center type-title text-ink">
        {title}
      </Text>
      <Text className="mt-2.5 max-w-80 text-center type-callout text-muted">{body}</Text>
      <Button
        label={button}
        onPress={onPress}
        variant="primary"
        size="lg"
        className="mt-6 w-full max-w-66"
      />
      {note ? <Text className="mt-2.5 text-center type-footnote text-muted">{note}</Text> : null}
      {extra}
    </View>
  );
}

export const signed = (
  amount: number,
  currency: CurrencyCode,
  prefs: Pick<DevicePreferences, "showCents" | "privacyMode">,
  forAccessibility = false,
) =>
  formatDisplayMoney(MinorUnits.make(amount), currency, prefs, {
    signDisplay: "exceptZero",
    forAccessibility,
  });

/** The row of filter chips, led by `lead` (the Group chip), ending in Reset all once any applies. */
export function Filters({
  lead,
  chips,
  filtered,
  onChange,
  trips,
  groupName,
  liveTrips,
  gameMenu,
}: {
  lead?: ReactNode;
  chips: ReadonlyArray<StatsChip>;
  filtered: boolean;
  onChange: (filters: StatsFilters) => void;
  trips?: StatsTrips;
  groupName?: string;
  liveTrips?: ReadonlySet<string>;
  gameMenu?: { readonly open: boolean; readonly setOpen: (open: boolean) => void };
}) {
  const android = Platform.OS === "android";

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Stats filters"
      className={android ? "flex-1" : "-mx-4"}
      contentContainerClassName="items-center gap-2 px-4"
      keyboardShouldPersistTaps={android ? "handled" : undefined}
    >
      {lead}
      {chips.map((chip) => {
        const onPick = (value: string) => {
          const option = chip.options.find((item) => item.value === value);

          if (option) onChange(option.filters);
        };

        const props = {
          name: chip.name,
          value: chip.value,
          applied: chip.applied,
          onChange: onPick,
          onClear: () => onChange(chip.cleared),
        };

        if (android && chip.key === "tripId" && trips)
          return (
            <TripFilter
              key={chip.key}
              chip={chip}
              trips={trips}
              groupName={groupName}
              liveTrips={liveTrips}
              onChange={onChange}
            />
          );

        if (android && (chip.key === "year" || (chip.key === "game" && gameMenu))) {
          return (
            <StatsMenu
              key={chip.key}
              {...props}
              menuState={chip.key === "game" ? gameMenu : undefined}
              options={chip.options.map(({ value, label }) => ({
                value,
                label,
                icon: chip.key === "year" ? (value === "" ? "all" : "year") : undefined,
              }))}
            />
          );
        }

        return <FilterChip key={chip.key} {...props} options={chip.options} />;
      })}
      {filtered ? (
        <Button label="Reset all" variant="ghost" size="sm" onPress={() => onChange({})} />
      ) : null}
    </ScrollView>
  );
}

function TripFilter({
  chip,
  trips,
  groupName,
  liveTrips,
  onChange,
}: {
  chip: StatsChip;
  trips: StatsTrips;
  groupName?: string;
  liveTrips?: ReadonlySet<string>;
  onChange: (filters: StatsFilters) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const selected = chip.options.find((option) => option.value === draft);
  const count = trips.byId.get(draft ?? "")?.sessions ?? 0;

  return (
    <>
      <StatsChipTrigger
        name={chip.name}
        label={chip.label}
        applied={chip.applied}
        onClear={() => onChange(chip.cleared)}
        onPress={() => setDraft(chip.value)}
      />
      {selected ? (
        <Sheet
          open
          title="Trip"
          onClose={() => setDraft(null)}
          footer={
            <Button
              label={
                draft === ""
                  ? "Show all trips"
                  : `Show ${count} ${count === 1 ? "session" : "sessions"}`
              }
              variant="primary"
              size="lg"
              onPress={() => {
                setDraft(null);
                onChange(selected.filters);
              }}
            />
          }
        >
          <Text className="type-footnote text-muted">
            {groupName
              ? `${groupName}’s trips, from start to finish.`
              : "Choose a trip to see it from start to finish."}
          </Text>
          <View accessibilityRole="radiogroup">
            {chip.options.map(({ value, label }) => {
              const trip = trips.byId.get(value);
              const checked = draft === value;
              const isLive = liveTrips?.has(value);

              const line =
                value === ""
                  ? `${groupName ? `Every trip in ${groupName}` : "Every trip and sessions without a trip"} · ${finishedSessions(trips.total)}`
                  : [trip?.range, finishedSessions(trip?.sessions ?? 0)]
                      .filter(Boolean)
                      .join(" · ");

              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked }}
                  onPress={() => setDraft(value)}
                  className={cn(
                    "min-h-15 flex-row items-center gap-4 rounded-2xl px-2 py-2",
                    checked && "bg-fill",
                  )}
                >
                  <StatsRadio selected={checked} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-sm font-semibold text-ink">{label}</Text>
                    <Text className="type-footnote text-muted">
                      {isLive ? <Text className="text-live">Live now · </Text> : null}
                      {line}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text className="type-footnote text-muted">
            Choosing a trip replaces the period filter.
            {groupName ? " Game and casino filters still apply." : ""}
          </Text>
        </Sheet>
      ) : null}
    </>
  );
}

type GameRow = {
  readonly key: string;
  readonly label: string;
  readonly meta: string;
  readonly chip: GameChip;
  readonly result: MinorUnits;
  readonly filters: StatsFilters;
};

const resultTrack = (rows: ReadonlyArray<{ readonly result: number }>) =>
  barTrack(
    rows.map((row) => row.result),
    { compress: true, minimum: 0.06 },
  );

/** Results by game, each row narrowing the page to that game. */
export function ByGame({
  rows,
  currency,
  onFilter,
}: {
  rows: ReadonlyArray<GameRow>;
  currency: CurrencyCode;
  onFilter: (filters: StatsFilters) => void;
}) {
  const prefs = usePreferences();
  const android = Platform.OS === "android";
  const track = resultTrack(rows);

  return (
    <View className="gap-2">
      <StatsHeading
        count={android ? `${rows.length} ${rows.length === 1 ? "game" : "games"}` : undefined}
      >
        By game
      </StatsHeading>
      <List>
        {rows.map((row) => (
          <ResultRow
            key={row.key}
            onPress={() => onFilter(row.filters)}
            accessibilityLabel={`${row.label}, ${row.meta}, ${signed(row.result, currency, prefs, true)}`}
            accessibilityHint={`Shows only ${row.label}`}
            className={android ? "gap-2 px-4 py-2.5" : undefined}
            leading={<View className={cn("size-2 rounded-full", chipColor[row.chip])} />}
            label={row.label}
            labelLines={android ? 2 : 1}
            meta={row.meta}
            metaLines={1}
            result={row.result}
            currency={currency}
            track={track}
          />
        ))}
      </List>
    </View>
  );
}

type CasinoRow = {
  readonly key: string;
  readonly label: string;
  readonly meta: string;
  readonly result: MinorUnits;
  readonly filters: StatsFilters;
};

/** Results by casino, most played first, the top few here and the rest behind See all. */
export function ByCasino({
  rows,
  currency,
  line,
  liveCasino,
  onFilter,
}: {
  rows: ReadonlyArray<CasinoRow>;
  currency: CurrencyCode;
  /** What See all covers: "All time · 12 finished sessions". */
  line: string;
  liveCasino?: string | undefined;
  onFilter: (filters: StatsFilters) => void;
}) {
  const [all, setAll] = useState(false);
  const android = Platform.OS === "android";
  const large = useLargeText();
  const more = rows.length > TOP_CASINOS;

  return (
    <View className="gap-2">
      <StatsHeading
        count={
          android && !more
            ? `${rows.length} ${rows.length === 1 ? "casino" : "casinos"}`
            : undefined
        }
        action={
          more ? (
            <Button label="See all" variant="ghost" size="sm" onPress={() => setAll(true)} />
          ) : undefined
        }
      >
        By casino
      </StatsHeading>
      <CasinoRows rows={rows.slice(0, TOP_CASINOS)} currency={currency} onFilter={onFilter} />
      {all ? (
        <Sheet
          open
          title="Casinos"
          description={android ? undefined : line}
          onClose={() => setAll(false)}
        >
          <View className="gap-2">
            {android ? <Text className="mb-2 type-footnote text-muted">{line}</Text> : null}
            <View
              className={cn(
                "flex-row justify-between",
                android ? "px-1" : "px-4",
                large && "flex-wrap gap-x-3",
              )}
            >
              <Text className={cn("text-muted", android ? "type-label" : "type-footnote")}>
                {android ? "MOST PLAYED FIRST" : "Most played first"}
              </Text>
              <Text className="type-footnote text-muted">Result</Text>
            </View>
            <CasinoRows
              rows={rows}
              currency={currency}
              inSheet={android}
              onFilter={(filters) => {
                setAll(false);
                onFilter(filters);
              }}
            />
            {android && liveCasino ? (
              <Text className="mt-2 type-footnote text-muted">{`A live session at ${liveCasino} isn’t included yet.`}</Text>
            ) : null}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

function CasinoRows({
  rows,
  currency,
  onFilter,
  inSheet = false,
}: {
  rows: ReadonlyArray<CasinoRow>;
  currency: CurrencyCode;
  inSheet?: boolean;
  onFilter: (filters: StatsFilters) => void;
}) {
  const prefs = usePreferences();
  const android = Platform.OS === "android";
  const track = resultTrack(rows);

  return (
    <List className={inSheet ? "bg-fill" : undefined}>
      {rows.map((row) => (
        <ResultRow
          key={row.key}
          onPress={() => onFilter(row.filters)}
          accessibilityLabel={`${row.label}, ${row.meta}, ${signed(row.result, currency, prefs, true)}`}
          accessibilityHint="Shows only this casino"
          className={android ? "gap-2.5 py-2.5" : undefined}
          label={row.label}
          labelLines={1}
          meta={row.meta}
          result={row.result}
          currency={currency}
          track={track}
          trailing={android ? <Icon name="chevron-right" color="faint" size={16} /> : null}
        />
      ))}
    </List>
  );
}

function ResultRow({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  className,
  leading,
  trailing,
  label,
  labelLines,
  meta,
  metaLines,
  result,
  currency,
  track,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint: string;
  className: string | undefined;
  leading?: ReactNode;
  trailing?: ReactNode;
  label: string;
  labelLines: number;
  meta: string;
  metaLines?: number;
  result: MinorUnits;
  currency: CurrencyCode;
  track: ReturnType<typeof barTrack>;
}) {
  const { privacyMode } = usePreferences();
  const android = Platform.OS === "android";
  const large = useLargeText();

  const text = (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text numberOfLines={large ? undefined : labelLines} className="type-heading text-ink">
        {label}
      </Text>
      <Text numberOfLines={large ? undefined : metaLines} className="type-footnote text-muted">
        {meta}
      </Text>
    </View>
  );

  const bar = <ResultBar result={result} track={track} hidden={privacyMode} large={large} />;

  const amount = (
    <Money
      amount={result}
      currency={currency}
      tone="result"
      fit={android || large}
      className={android ? "min-w-18 text-right type-number" : "min-w-18 text-right font-semibold"}
    />
  );

  return (
    <Row
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      className={cn(className, large && "flex-col items-stretch gap-2")}
    >
      {large ? (
        <>
          <View className="flex-row items-center gap-2.5">
            {leading}
            {text}
            {trailing}
          </View>
          <View className="flex-row items-center gap-3">
            {bar}
            {amount}
          </View>
        </>
      ) : (
        <>
          {leading}
          {text}
          {bar}
          {amount}
          {trailing}
        </>
      )}
    </Row>
  );
}

function ResultBar({
  result,
  track,
  hidden,
  large,
}: {
  result: number;
  track: ReturnType<typeof barTrack>;
  hidden: boolean;
  large: boolean;
}) {
  const [rule, win, loss] = useCSSVariable([
    "--color-fill-strong",
    "--color-win",
    "--color-loss",
  ]).map(String);

  const zero = 5 + track.zero * 90;
  const sign = result < 0 ? -1 : 1;
  const length = track.extent(result) * 90;
  const end = zero + sign * length;
  const radius = Math.min(4, length);
  const shoulder = end - sign * radius;

  return (
    <View
      className={large ? "min-w-0 flex-1" : "w-[26%] max-w-25"}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Svg width="100%" height={16} viewBox="0 0 100 16">
        <Line
          x1={zero}
          y1={0}
          x2={zero}
          y2={16}
          stroke={rule}
          strokeLinecap="round"
          strokeDasharray="0.3 3.5"
        />
        {length > 0 ? (
          <Path
            d={`M${zero} 4H${shoulder}Q${end} 4 ${end} 8Q${end} 12 ${shoulder} 12H${zero}Z`}
            fill={hidden ? rule : result < 0 ? loss : win}
          />
        ) : null}
      </Svg>
    </View>
  );
}

export function Figure({
  label,
  sub,
  compact = false,
  children,
}: {
  label: string;
  sub?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <View className={cn("min-w-0 gap-1 pr-2", compact ? "flex-1" : "w-1/2")}>
      <Text className={cn("type-label text-muted", compact && "text-[10px]")}>{label}</Text>
      {children}
      {sub ? <Text className="type-footnote text-muted">{sub}</Text> : null}
    </View>
  );
}
