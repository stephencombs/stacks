import { barTrack, runningLine } from "@stacks/client-runtime/chart";
import type { PersonalStatsView } from "@stacks/client-runtime/stats";
import { RECORDING_CURRENCY } from "@stacks/client-runtime/recordingView";
import type { VisitId } from "@stacks/contracts";
import * as Match from "effect/Match";
import { useState, type ReactNode } from "react";
import { PanResponder, Platform, View, type GestureResponderEvent } from "react-native";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polyline,
  Rect,
  Stop,
} from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Icon } from "../components/ui/Icon";
import { List, Row, Surface } from "../components/ui/Surface";
import { Text } from "../components/ui/Text";
import { cn } from "../components/ui/cn";
import {
  HIDDEN_AMOUNT,
  HIDDEN_AMOUNT_LABEL,
  formatDisplayMoney,
  usePreferences,
} from "../lib/preferences";

import { StatsHeading, signed } from "./StatsParts";

export type StatsSummary = Extract<PersonalStatsView, { kind: "stats" }>;

const currency = RECORDING_CURRENCY;

function Dash() {
  return (
    <Text accessibilityLabel="Not available" className="type-number text-faint">
      –
    </Text>
  );
}

function Tile({
  label,
  divided = false,
  children,
}: {
  label: string;
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <View accessible className={cn("flex-1 gap-0.5 px-4 py-3", divided && "border-l border-line")}>
      <Text className="type-label text-muted">{label}</Text>
      {children}
    </View>
  );
}

function ReturnFigure({ figure }: { figure: StatsSummary["returnRate"] }) {
  const { privacyMode } = usePreferences();

  if (figure.tone === "none") return <Dash />;

  return (
    <Text
      accessibilityLabel={privacyMode ? HIDDEN_AMOUNT_LABEL : undefined}
      className={cn(
        "type-number tabular-nums",
        privacyMode || figure.tone === "even"
          ? "text-muted"
          : figure.tone === "win"
            ? "text-win"
            : "text-loss",
      )}
    >
      {privacyMode ? HIDDEN_AMOUNT : figure.label}
    </Text>
  );
}

/** Your result at a glance: the figure, how far it has climbed, the line that drew it, and three rates. */
export function StatsHero({ view }: { view: StatsSummary }) {
  const prefs = usePreferences();

  return (
    <View className="overflow-hidden rounded-[22px] bg-surface">
      <View className="px-5 pt-5">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text accessibilityRole="header" className="min-w-0 flex-1 type-label text-muted">
            {view.title}
          </Text>
          <Text className="shrink-0 type-footnote text-muted">{view.played}</Text>
        </View>
        <Money
          amount={view.result}
          currency={currency}
          tone="result"
          fit
          className="mt-1.5 type-hero"
        />
        {view.climb !== null ? (
          <Text
            accessibilityLabel={`Up ${formatDisplayMoney(view.climb, currency, prefs, { forAccessibility: true })} from your low`}
            className="mt-1 type-footnote text-muted"
          >
            Up <Money amount={view.climb} currency={currency} className="font-medium" /> from your
            low
          </Text>
        ) : null}
      </View>
      {view.chart ? <RunningChart chart={view.chart} /> : <View className="h-5" />}
      <View className="flex-row border-t border-line">
        <Tile label="Per hour">
          {view.hourlyResult === null ? (
            <Dash />
          ) : (
            <Money
              amount={view.hourlyResult}
              currency={currency}
              tone="result"
              fit
              className="type-number"
            />
          )}
        </Tile>
        <Tile label="Win rate" divided>
          {view.winRate === "–" ? (
            <Dash />
          ) : (
            <Text className="type-number text-ink">{view.winRate}</Text>
          )}
        </Tile>
        <Tile label="Return" divided>
          <ReturnFigure figure={view.returnRate} />
        </Tile>
      </View>
    </View>
  );
}

const PAD = { x: 16, y: 10 };
const CALLOUT = 196;

function RunningChart({ chart }: { chart: NonNullable<StatsSummary["chart"]> }) {
  const android = Platform.OS === "android";
  const height = android ? 88 : 96;
  const prefs = usePreferences();

  const [win, loss, ink, strong, surface, muted] = useCSSVariable([
    "--color-win",
    "--color-loss",
    "--color-ink",
    "--color-fill-strong",
    "--color-surface",
    "--color-muted",
  ]).map(String);

  const [width, setWidth] = useState(0);
  const [picked, setInspect] = useState<number | null>(null);
  const { points } = chart;
  const last = points.length - 1;
  const inspect = picked !== null && picked <= last ? picked : null;
  const plot = runningLine(points, { width: Math.max(width, 2 * PAD.x), height }, PAD);
  const nearest = (x: number) => plot.nearest(x);
  const finish = points[last]!.total;
  const color = prefs.privacyMode ? muted! : finish > 0 ? win! : finish < 0 ? loss! : ink!;
  const fill = prefs.privacyMode ? strong! : color;
  const calloutWidth = android ? Math.min(190, width) : CALLOUT;

  const drag = android
    ? PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event) => setInspect(nearest(event.nativeEvent.locationX)),
        onPanResponderMove: (event) => setInspect(nearest(event.nativeEvent.locationX)),
      }).panHandlers
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: (event: GestureResponderEvent) =>
          setInspect(nearest(event.nativeEvent.locationX)),
        onResponderMove: (event: GestureResponderEvent) =>
          setInspect(nearest(event.nativeEvent.locationX)),
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
    <View className="mt-3 gap-1">
      <View className="flex-row items-center justify-between px-5">
        <Text className="type-footnote text-muted">Running result</Text>
        <Text
          accessibilityRole="button"
          onPress={() => setInspect(inspect === null ? last : null)}
          suppressHighlighting
          className={cn(
            "-mx-2 -my-3.5 px-2 py-3.5 type-footnote",
            android ? "font-semibold text-ink" : "text-muted",
          )}
        >
          {inspect === null ? "Drag to inspect" : "Done"}
        </Text>
      </View>
      <View
        style={{ height }}
        onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Running result over ${points.length} finished sessions, ${chart.from} to ${chart.to}`}
        accessibilityValue={{
          text: shown
            ? `${shown.day}, session ${signed(shown.result, currency, prefs, true)}, running ${signed(shown.total, currency, prefs, true)}`
            : `Now ${signed(total, currency, prefs, true)}`,
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
              <LinearGradient id="running-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fill} stopOpacity={0.28} />
                <Stop offset="1" stopColor={fill} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line
              x1={0}
              x2={width}
              y1={plot.zero}
              y2={plot.zero}
              stroke={strong}
              strokeDasharray="3 4"
            />
            <Path d={plot.area} fill="url(#running-fill)" />
            <Polyline
              points={plot.line}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {shown && dot ? (
              <Line x1={dot.x} x2={dot.x} y1={0} y2={height} stroke={muted} strokeDasharray="3 3" />
            ) : null}
            {dot ? (
              <>
                <Circle cx={dot.x} cy={dot.y} r={10} fill={fill} fillOpacity={0.2} />
                <Circle
                  cx={dot.x}
                  cy={dot.y}
                  r={4.5}
                  fill={color}
                  stroke={shown ? surface : "none"}
                  strokeWidth={shown ? 2 : 0}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
        {shown ? (
          <View
            pointerEvents="none"
            className={cn(
              "absolute gap-1 rounded-xl px-3 py-2",
              android ? "bg-raised shadow-(--elevation-float)" : "border border-line bg-surface",
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
                currency={currency}
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
                currency={currency}
                tone="result"
                className="text-xs font-semibold"
              />
            </View>
          </View>
        ) : null}
      </View>
      <View className="flex-row justify-between px-5 pb-4">
        <Text className="type-footnote text-muted">{chart.from}</Text>
        <Text className="type-footnote text-muted">{chart.to}</Text>
      </View>
    </View>
  );
}

function MoneyTile({
  label,
  amount,
  sessions,
  even = 0,
  divided = false,
}: {
  label: string;
  amount: StatsSummary["money"]["won"]["result"];
  sessions: number;
  even?: number;
  divided?: boolean;
}) {
  return (
    <View
      accessible
      className={cn("min-w-0 flex-1 gap-0.5 px-4 py-3", divided && "border-l border-line")}
    >
      <Text className="type-label text-muted">{label}</Text>
      <Money amount={amount} currency={currency} tone="result" fit className="type-number-lg" />
      <Text className="type-footnote text-muted">
        {`${sessions} ${sessions === 1 ? "session" : "sessions"}`}
        {even > 0 ? ` · ${even} even` : ""}
      </Text>
    </View>
  );
}

/** What you won and lost, and the money behind the result. */
export function MoneySection({ money }: { money: StatsSummary["money"] }) {
  return (
    <View className="gap-2">
      <StatsHeading>Money</StatsHeading>
      <Surface>
        <View className="flex-row">
          <MoneyTile label="Won" amount={money.won.result} sessions={money.won.sessions} />
          <MoneyTile
            label="Lost"
            amount={money.lost.result}
            sessions={money.lost.sessions}
            even={money.even}
            divided
          />
        </View>
        <Row>
          <Text className="flex-1 type-body text-ink">Bought in</Text>
          <Money amount={money.buyIn} currency={currency} className="type-number" />
        </Row>
        <Row>
          <Text className="flex-1 type-body text-ink">Cashed out</Text>
          <Money amount={money.cashOut} currency={currency} className="type-number" />
        </Row>
        {money.adjustment !== null ? (
          <Row>
            <Text className="flex-1 type-body text-ink">Adjustments</Text>
            <Money
              amount={money.adjustment}
              currency={currency}
              tone="result"
              className="type-number"
            />
          </Row>
        ) : null}
      </Surface>
    </View>
  );
}

const BAR_HEIGHT = 88;
const BAR_PAD = 3;

/** Results by month, or by night for a trip: rounded bars around break-even. */
export function PeriodSection({ bars }: { bars: NonNullable<StatsSummary["bars"]> }) {
  const prefs = usePreferences();

  const [win, loss, strong, muted] = useCSSVariable([
    "--color-win",
    "--color-loss",
    "--color-fill-strong",
    "--color-muted",
  ]).map(String);

  const [width, setWidth] = useState(0);

  const track = barTrack(
    bars.bars.map((bar) => bar.result),
    { minimum: 0.04 },
  );

  const inner = BAR_HEIGHT - 2 * BAR_PAD;
  const zero = BAR_PAD + (1 - track.zero) * inner;
  const column = width / bars.bars.length;
  const barWidth = Math.min(22, Math.max(6, column * 0.5));

  return (
    <View className="gap-2">
      <StatsHeading count={bars.count}>{bars.title}</StatsHeading>
      <Surface className="gap-3.5 p-4">
        {bars.sentences.length > 0 ? (
          <Text
            accessibilityLabel={bars.sentences
              .map(
                (sentence) =>
                  `${sentence.before} ${signed(sentence.amount, currency, prefs, true)}.`,
              )
              .join(" ")}
            className="type-callout text-ink"
          >
            {bars.sentences.map((sentence, index) => (
              <Text key={sentence.key}>
                {index > 0 ? " " : ""}
                {sentence.before}{" "}
                <Money
                  amount={sentence.amount}
                  currency={currency}
                  tone="result"
                  className="font-medium"
                />
                .
              </Text>
            ))}
          </Text>
        ) : null}
        <View>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={bars.summary}
            style={{ height: BAR_HEIGHT }}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          >
            {width > 0 ? (
              <Svg width={width} height={BAR_HEIGHT}>
                <Line x1={0} x2={width} y1={zero} y2={zero} stroke={strong} strokeDasharray="3 4" />
                {bars.bars.map((bar, index) => {
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
                      fill={prefs.privacyMode ? strong : bar.result > 0 ? win : loss}
                      opacity={prefs.privacyMode || bar.emphasis ? 1 : 0.35}
                    />
                  );
                })}
              </Svg>
            ) : null}
          </View>
          <View className="mt-1 flex-row">
            {bars.bars.map((bar) => (
              <View
                key={bar.key}
                accessible
                accessibilityLabel={`${bar.name}, ${Match.value(bar.status).pipe(
                  Match.when("none", () => "no play"),
                  Match.when("even", () => "even"),
                  Match.orElse(() => signed(bar.result, currency, prefs, true)),
                )}`}
                className="flex-1 items-center"
              >
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.2}
                  className={cn(
                    "text-[11px] leading-[14px]",
                    bar.emphasis && !prefs.privacyMode
                      ? "font-semibold text-ink"
                      : bar.status === "none"
                        ? "text-faint"
                        : "text-muted",
                  )}
                >
                  {bar.label}
                </Text>
                {bar.year ? (
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    className="text-[10px] leading-[12px] text-faint"
                  >
                    {bar.year}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </Surface>
    </View>
  );
}

/** What the pattern sentences say, once enough sessions stand behind them. */
export function PatternsSection({ patterns }: { patterns: StatsSummary["patterns"] }) {
  const prefs = usePreferences();

  return (
    <View className="gap-2">
      <StatsHeading>Patterns</StatsHeading>
      <List>
        {patterns.map((pattern) => (
          <Row key={pattern.key}>
            <Text
              accessibilityLabel={`${pattern.before} ${signed(pattern.amount, currency, prefs, true)}${pattern.after}`}
              className="flex-1 type-callout text-ink"
            >
              {pattern.before}{" "}
              <Money
                amount={pattern.amount}
                currency={currency}
                tone="result"
                className="font-medium"
              />
              {pattern.after}
            </Text>
          </Row>
        ))}
      </List>
    </View>
  );
}

/** The biggest win and loss, each opening its session. */
export function RecordsSection({
  records,
  onOpen,
}: {
  records: StatsSummary["records"];
  onOpen: (visitId: VisitId) => void;
}) {
  const prefs = usePreferences();

  return (
    <View className="gap-2">
      <StatsHeading>Records</StatsHeading>
      <List>
        {records.map((record) => (
          <Row
            key={record.key}
            onPress={() => onOpen(record.visitId)}
            accessibilityLabel={`${record.label}, ${record.meta}, ${signed(record.result, currency, prefs, true)}`}
            accessibilityHint="Opens the session"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="type-heading text-ink">{record.label}</Text>
              <Text numberOfLines={1} className="type-footnote text-muted">
                {record.meta}
              </Text>
            </View>
            <Money
              amount={record.result}
              currency={currency}
              tone="result"
              className="type-number"
            />
            <Icon name="chevron-right" color="faint" size={18} />
          </Row>
        ))}
      </List>
    </View>
  );
}
