import { barTrack } from "@stacks/client-runtime/chart";
import {
  lineText,
  type GroupStatsView,
  type Line,
  type Who,
} from "@stacks/client-runtime/groupStats";
import type { StatsFilters } from "@stacks/client-runtime/stats";
import type { CurrencyCode } from "@stacks/contracts";
import * as Predicate from "effect/Predicate";
import { use, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Line as SvgLine, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Icon } from "../components/ui/Icon";
import { Row } from "../components/ui/Surface";
import { Text } from "../components/ui/Text";
import { cn } from "../components/ui/cn";
import { InSheet } from "../components/ui/sheetContext";
import { formatDisplayMoney, usePreferences } from "../lib/preferences";
import { useLargeText } from "../lib/useLargeText";

import { Chip } from "./Chip";
import { PlayerChip } from "./PlayerChip";
import { signed } from "./StatsParts";

const useSpoken = (currency: CurrencyCode) => {
  const prefs = usePreferences();

  return (line: Line) =>
    lineText(line, (part) =>
      part.tone === "result"
        ? signed(part.amount, currency, prefs, true)
        : formatDisplayMoney(part.amount, currency, prefs, { forAccessibility: true }),
    );
};

/** A sentence with its amounts drawn through `Money`. */
export function LineText({
  line,
  currency,
  className,
  moneyClassName = "font-medium",
  numberOfLines,
}: {
  line: Line;
  currency: CurrencyCode;
  className?: string;
  moneyClassName?: string;
  numberOfLines?: number | undefined;
}) {
  const spoken = useSpoken(currency);
  const children: Array<ReactNode> = [];

  for (const [position, part] of line.entries())
    children.push(
      Predicate.isString(part) ? (
        part
      ) : (
        <Money
          key={position}
          amount={part.amount}
          currency={currency}
          tone={part.tone}
          className={moneyClassName}
        />
      ),
    );

  return (
    <Text accessibilityLabel={spoken(line)} numberOfLines={numberOfLines} className={className}>
      {children}
    </Text>
  );
}

function PairChip({ first, second, size = 28 }: { first: Who; second: Who; size?: number }) {
  const inSheet = use(InSheet);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center"
    >
      <PlayerChip playerId={first.playerId} chip={first.chip} name={first.name} size={size} />
      <View
        className={cn("-ml-3 rounded-full border-2", inSheet ? "border-raised" : "border-surface")}
      >
        <PlayerChip playerId={second.playerId} chip={second.chip} name={second.name} size={size} />
      </View>
    </View>
  );
}

function Leaders({ people }: { people: ReadonlyArray<Who> }) {
  if (people.length === 0) return null;
  const [first, second] = people;

  if (people.length === 1)
    return (
      <PlayerChip playerId={first!.playerId} chip={first!.chip} name={first!.name} size={28} />
    );

  if (people.length === 2) return <PairChip first={first!} second={second!} />;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="size-7 items-center justify-center rounded-full bg-fill-strong"
    >
      <Text className="type-footnote font-semibold text-ink">{people.length}</Text>
    </View>
  );
}

/**
 * A row of the group page that says something about people: who it's about, what it found, and a
 * figure at the end. It only opens something when it has `onPress`, and only then shows a chevron.
 */
export function InsightRow({
  people,
  title,
  line,
  trailing,
  currency,
  onPress,
  hint,
  className,
}: {
  people: ReadonlyArray<Who>;
  title: string;
  line: Line;
  trailing: Line | null;
  currency: CurrencyCode;
  onPress?: () => void;
  hint?: string;
  className?: string;
}) {
  const large = useLargeText();
  const spoken = useSpoken(currency);

  const label = [title, spoken(line), trailing ? spoken(trailing) : null]
    .filter((part) => part !== null)
    .join(", ");

  const body = (
    <>
      <View className={cn("min-w-0 flex-row items-center gap-3", !large && "flex-1")}>
        <Leaders people={people} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="type-heading text-ink">{title}</Text>
          <LineText line={line} currency={currency} className="type-footnote text-muted" />
        </View>
        {large && onPress ? <Icon name="chevron-right" color="faint" size={16} /> : null}
      </View>
      {trailing ? (
        <LineText
          line={trailing}
          currency={currency}
          className={cn("type-number text-ink", large ? "text-left" : "shrink-0 text-right")}
          moneyClassName="type-number"
        />
      ) : null}
      {!large && onPress ? <Icon name="chevron-right" color="faint" size={16} /> : null}
    </>
  );

  const stack = large ? "flex-col items-stretch gap-2" : undefined;

  if (onPress)
    return (
      <Row
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityHint={hint}
        className={cn(stack, className)}
      >
        {body}
      </Row>
    );

  return (
    <Row className={cn(stack, className)}>
      <View
        accessible
        accessibilityLabel={label}
        className={cn("min-w-0 flex-1 gap-2", !large && "flex-row items-center gap-3")}
      >
        {body}
      </View>
    </Row>
  );
}

type Chart = NonNullable<Extract<GroupStatsView, { kind: "stats" }>["hero"]["chart"]>;

const PLOT = 132;
const CHIP = 20;
const GAP = 4;
const TAP = 44;
const CHIPS_FROM = 24;

/**
 * The group's result by trip, or by night once a trip is picked: a rounded-cap bar for each, up
 * or down from a dashed zero, with the leader's chip at the end of it. A trip with a tied lead
 * shows no chip. Privacy mode turns the bars neutral. A column opens its trip only when it's wide
 * enough to hit; the Trips list is the path to every one.
 */
export function ResultBars({
  chart,
  currency,
  onOpen,
}: {
  chart: Chart;
  currency: CurrencyCode;
  onOpen: (filters: StatsFilters) => void;
}) {
  const { privacyMode } = usePreferences();
  const spoken = useSpoken(currency);
  const [width, setWidth] = useState(0);

  const [win, loss, strong, muted] = useCSSVariable([
    "--color-win",
    "--color-loss",
    "--color-fill-strong",
    "--color-muted",
  ]).map(String);

  const { bars } = chart;
  const column = width / bars.length;
  const tappable = column >= TAP;
  const showChips = column >= CHIPS_FROM;
  const barWidth = Math.min(22, Math.max(6, column * 0.5));

  const above = bars.some((bar) => bar.status === "up" || bar.status === "even");
  const below = bars.some((bar) => bar.status === "down");
  const top = above && showChips ? CHIP + GAP : GAP;
  const bottom = below && showChips ? CHIP + GAP : GAP;
  const inner = PLOT - top - bottom;

  const track = barTrack(
    bars.filter((bar) => bar.status !== "none").map((bar) => bar.result),
    { minimum: 0.04 },
  );

  const zero = top + (1 - track.zero) * inner;

  const summary = spoken([
    `${chart.title}, ${chart.by === "trip" ? "oldest to newest" : "first night to last"}. `,
    ...bars.flatMap((bar) => [...bar.spoken, " "]),
    ...(chart.earlier > 0
      ? [`${chart.earlier} earlier ${chart.earlier === 1 ? "trip isn't" : "trips aren't"} shown.`]
      : []),
  ]);

  return (
    <View className="mt-3 gap-1 px-4 pb-4">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
        style={{ height: PLOT }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <>
            <Svg width={width} height={PLOT} pointerEvents="none">
              <SvgLine
                x1={0}
                x2={width}
                y1={zero}
                y2={zero}
                stroke={strong}
                strokeDasharray="3 4"
              />
              {bars.map((bar, index) => {
                if (bar.status === "none") return null;
                const x = index * column + column / 2;

                if (bar.status === "even")
                  return <Circle key={bar.key} cx={x} cy={zero} r={2} fill={muted} />;

                const length = track.extent(bar.result) * inner;

                return (
                  <Rect
                    key={bar.key}
                    x={x - barWidth / 2}
                    y={bar.result > 0 ? zero - length : zero}
                    width={barWidth}
                    height={length}
                    rx={4}
                    fill={privacyMode ? strong : bar.result > 0 ? win : loss}
                  />
                );
              })}
            </Svg>
            {showChips
              ? bars.map((bar, index) => {
                  if (bar.leader === null || bar.status === "none") return null;
                  const length = bar.status === "even" ? 0 : track.extent(bar.result) * inner;
                  const x = index * column + column / 2 - CHIP / 2;

                  const y =
                    bar.status === "down" ? zero + length + GAP : zero - length - GAP - CHIP;

                  return (
                    <View
                      key={bar.key}
                      pointerEvents="none"
                      style={{ position: "absolute", left: x, top: y }}
                    >
                      <Chip chip={bar.leader.chip} name={bar.leader.name} size={CHIP} />
                    </View>
                  );
                })
              : null}
          </>
        ) : null}
      </View>
      <View className="flex-row">
        {bars.map((bar) => {
          const text = (
            <>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                className={cn(
                  "text-[11px] leading-[14px]",
                  bar.status === "none" ? "text-faint" : "text-muted",
                )}
              >
                {bar.label}
              </Text>
              {bar.year ? (
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1}
                  className="text-[10px] leading-[12px] text-faint"
                >
                  {bar.year}
                </Text>
              ) : null}
            </>
          );

          return bar.filters && tappable ? (
            <Pressable
              key={bar.key}
              accessibilityRole="button"
              accessibilityLabel={spoken(bar.spoken)}
              accessibilityHint="Shows only this trip"
              onPress={() => onOpen(bar.filters!)}
              className="min-h-11 flex-1 items-center justify-center active:bg-fill"
            >
              {text}
            </Pressable>
          ) : (
            <View
              key={bar.key}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className="flex-1 items-center"
            >
              {text}
            </View>
          );
        })}
      </View>
      {chart.earlier > 0 ? (
        <Text className="mt-1 type-footnote text-muted">
          {`Latest ${bars.length} of ${bars.length + chart.earlier} trips`}
        </Text>
      ) : null}
    </View>
  );
}
