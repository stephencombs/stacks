import type { CurrencyCode, PlayerId } from "@stacks/contracts";
import {
  around,
  fitAxisLabels,
  labelWidth,
  lineScale,
  placeLabel,
  spreadLabels,
} from "@stacks/client-runtime/chart";
import { formatDay, venueLabel } from "@stacks/client-runtime/format";
import { boardMoney, returnLabel } from "@stacks/client-runtime/trip";
import { raceLines, type RaceMeasure, type StatsSession } from "@stacks/shared/stats";
import type * as DateTime from "effect/DateTime";
import { useState } from "react";
import { PanResponder, Platform, View } from "react-native";
import { Text } from "../components/ui/Text";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Choice } from "../components/ui/Field";
import { chartCurve } from "../components/ui/chartCurve";
import { cn } from "../components/ui/cn";
import { HIDDEN_AMOUNT_LABEL, usePreferences } from "../lib/preferences";

const label = "text-sm";
const shortDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const lastDay = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type Racer = { readonly playerId: PlayerId; readonly name: string; readonly chip?: number };

/** A finished session as the race sees it, oldest first. */
type RaceSession = StatsSession & {
  readonly session: { readonly id: string; readonly startedAt: DateTime.Utc };
};

/** Where on the axis a stretch of sessions starts, such as a night or a trip. */
type Mark = { readonly index: number; readonly label: string };

const measures = [
  { value: "money", label: "Money" },
  { value: "return", label: "% of buy-in" },
] as const;

const HEIGHT = 168;
const PAD = { x: 16, y: 14 };

const MARKS = 22;
const MARK_FONT = 11;
const LETTER = 12;

const INSET = 8;

/**
 * Everyone's running result from break-even, session by session, with a replay. The line you're
 * following is ink; the leader reads out above it.
 */
export function Race<S extends RaceSession>({
  sessions,
  players,
  currency,
  picked,
  marks,
  where,
  latest,
  stats = false,
  you,
}: {
  sessions: ReadonlyArray<S>;
  players: ReadonlyArray<Racer>;
  currency: CurrencyCode;
  picked: PlayerId;
  marks: ReadonlyArray<Mark>;
  where: (session: S) => string;
  /** The heading's lead-in at the latest session. */
  latest: string;
  stats?: boolean;
  you?: PlayerId;
}) {
  const height = stats ? Math.max(128, players.length * 15 + 12) : HEIGHT;
  const last = sessions.length - 1;
  const [pinned, setPinned] = useState<number | null>(null);
  const at = pinned === null ? last : Math.min(pinned, last);
  const setAt = (next: number) => setPinned(next >= last ? null : next);
  const [measure, setMeasure] = useState<RaceMeasure>("money");
  const prefs = usePreferences();
  const [width, setWidth] = useState(0);

  const ios = Platform.OS === "ios";

  const [ink, muted, ring, blue, surface, ...chips] = useCSSVariable([
    "--color-ink",
    "--color-muted",
    "--color-fill-strong",
    "--color-chip-blue",
    "--color-surface",
    ...Array.from({ length: 8 }, (_, index) => `--color-chip-${index + 1}`),
  ]).map(String);

  const lines = raceLines(
    sessions,
    players.map((p) => p.playerId),
    stats ? "money" : measure,
  ).map((line, i) => ({ ...line, ...players[i]! }));

  const chartNames = new Map(
    players.map(({ playerId, name }) => [
      playerId,
      stats && playerId === you ? "You" : name.trim().split(/\s+/)[0] || name,
    ]),
  );

  const labelSpace = Math.min(
    100,
    Math.max(30, ...[...chartNames.values()].map((name) => labelWidth(name, LETTER) + 24)),
  );

  const plot = lineScale(
    lines.map((l) => l.line),
    { width: Math.max(0, width - labelSpace), height },
    PAD,
    stats
      ? undefined
      : around(
          lines.findIndex((l) => l.playerId === picked),
          lines.length,
        ),
  );

  const standing = lines
    .map((l) => ({ ...l, now: l.values[at]! }))
    .toSorted((a, b) => (b.now ?? -Infinity) - (a.now ?? -Infinity));

  const [leader, second] = standing;
  const session = sessions[at]!;

  const drawn = lines.toSorted(
    (a, b) => Number(a.playerId === picked) - Number(b.playerId === picked),
  );

  const point = at + 1;

  const labels = spreadLabels(
    drawn.map(({ line }) => plot.y(line[point]!)),
    LETTER + 6,
    { min: LETTER, max: height - LETTER },
  );

  const axis = stats
    ? [
        { index: 0, label: shortDay.format(sessions[0]!.session.startedAt.epochMilliseconds) },
        { index: last, label: lastDay.format(sessions[last]!.session.startedAt.epochMilliseconds) },
      ]
    : marks;

  const edges = { min: INSET, max: Math.max(INSET, width - INSET) };

  const visibleAxis = fitAxisLabels(
    axis.map((mark, index) => ({ ...mark, x: plot.x(stats && index === 0 ? 0 : mark.index + 1) })),
    MARK_FONT,
    edges,
  );

  const grid = ios
    ? [PAD.y, height / 2, height - PAD.y].filter((y) => Math.abs(y - plot.zero) >= 8)
    : [];

  const path = (points: ReadonlyArray<{ x: number; y: number }>) =>
    ios
      ? chartCurve(points)
      : points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");

  const scrub = (locationX: number) =>
    setAt(
      Math.max(
        0,
        Math.min(
          last,
          Math.round(((locationX - PAD.x) / (width - labelSpace - 2 * PAD.x)) * (last + 1)) - 1,
        ),
      ),
    );

  const drag = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderGrant: (event) => scrub(event.nativeEvent.locationX),
    onPanResponderMove: (event) => scrub(event.nativeEvent.locationX),
  });

  const lead =
    second && leader!.now !== second.now
      ? measure === "money"
        ? boardMoney(leader!.now! - second.now!, currency, false, prefs)
        : returnLabel(leader!.now)
      : null;

  const leadLabel =
    measure === "money" && prefs.privacyMode && lead !== null ? HIDDEN_AMOUNT_LABEL : lead;

  const headline = !second
    ? `${leader!.name} leads`
    : lead === null
      ? `${leader!.name} and ${second.name} are tied`
      : `${leader!.name} leads ${measure === "money" ? "by" : "at"}`;

  return (
    <View className="gap-4">
      {stats ? null : (
        <>
          <View className="gap-1">
            <Text className={cn(label, "text-muted")}>
              {at === last ? latest : `After session ${at + 1} of ${sessions.length}`} ·{" "}
              {where(session)}
            </Text>
            <View
              accessible
              accessibilityRole="header"
              accessibilityLabel={leadLabel === null ? headline : `${headline} ${leadLabel}`}
              className="flex-row flex-wrap items-baseline gap-x-2"
            >
              <Text className="text-xl font-semibold text-ink">{headline}</Text>
              {lead === null ? null : (
                <Text
                  className={cn(
                    "tabular-nums text-3xl leading-10",
                    measure === "money" && prefs.privacyMode ? "text-muted" : "text-win",
                  )}
                >
                  {lead}
                </Text>
              )}
            </View>
            <Text className="text-sm text-muted">
              Session {at + 1}: {venueLabel(session.venue)}, {formatDay(session.session.startedAt)}
            </Text>
          </View>
          <Choice
            label="Measure"
            labelHidden
            options={measures}
            value={measure}
            onChange={setMeasure}
          />
        </>
      )}

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Replay session by session"
        accessibilityValue={{
          text: `Session ${at + 1} of ${sessions.length}, ${venueLabel(session.venue)}`,
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          setAt(
            Math.max(
              0,
              Math.min(last, at + (event.nativeEvent.actionName === "increment" ? 1 : -1)),
            ),
          )
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        {...drag.panHandlers}
        className={cn("overflow-hidden bg-surface", stats ? "rounded-[22px]" : "rounded-xl")}
        style={{ height: height + MARKS }}
      >
        {width > 0 ? (
          <Svg width={width} height={height + MARKS} pointerEvents="none">
            {grid.map((y) => (
              <Line
                key={y}
                x1={PAD.x}
                x2={width - labelSpace}
                y1={y}
                y2={y}
                stroke={ring}
                strokeLinecap="round"
                strokeDasharray="0.3 3.5"
              />
            ))}
            <Line
              x1={0}
              x2={width - labelSpace}
              y1={plot.zero}
              y2={plot.zero}
              stroke={ring}
              strokeDasharray="3 4"
            />
            {visibleAxis.map((mark) => (
              <SvgText
                key={mark.index}
                x={mark.x}
                y={height + MARKS - 8}
                textAnchor={mark.anchor}
                fill={muted}
                fontFamily="Allo"
                fontSize={MARK_FONT}
              >
                {mark.label}
              </SvgText>
            ))}
            {stats && at === last ? null : (
              <Line
                x1={plot.x(point)}
                x2={plot.x(point)}
                y1={PAD.y / 2}
                y2={height - PAD.y / 2}
                stroke={ring}
              />
            )}
            {drawn.map(({ playerId, line, chip }, i) => {
              const yours = playerId === picked;

              const color =
                stats && !prefs.privacyMode
                  ? (chips[(chip ?? 1) - 1] ?? muted)
                  : yours
                    ? ios && !prefs.privacyMode
                      ? blue
                      : ink
                    : muted;

              const points = line.map((v, i) => ({ x: plot.x(i), y: plot.y(v) }));
              const now = { x: plot.x(point), y: plot.y(line[point]!) };
              const off = plot.clipped(line[point]!);

              const chartName =
                chartNames.get(playerId)! + (off === 1 ? " ↑" : off === -1 ? " ↓" : "");

              const seatWidth = labelWidth(chartName, LETTER);
              const seat = placeLabel(now.x + 9 + seatWidth / 2, seatWidth, edges);

              return (
                <G key={playerId}>
                  <Path
                    d={path(points.slice(point))}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.15}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                  <Path
                    d={path(points.slice(0, point + 1))}
                    fill="none"
                    stroke={color}
                    strokeOpacity={stats || yours ? 1 : 0.45}
                    strokeWidth={stats ? 1.8 : yours ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {!ios && yours && (!stats || at !== last) ? (
                    <Circle cx={now.x} cy={now.y} r={10} fill={color} fillOpacity={0.2} />
                  ) : null}
                  {stats ? (
                    <Line x1={now.x} y1={now.y} x2={now.x + 8} y2={labels[i]} stroke={color} />
                  ) : null}
                  <Circle
                    cx={now.x}
                    cy={now.y}
                    r={stats ? (yours ? 3 : 2.5) : yours ? 4.5 : 3}
                    fill={ios && yours ? surface : color}
                    stroke={ios && yours ? color : undefined}
                    strokeWidth={ios && yours ? 2 : undefined}
                  />
                  <SvgText
                    x={seat.x}
                    y={labels[i]! + 4}
                    textAnchor={seat.anchor}
                    fontSize={LETTER}
                    fontFamily="Allo"
                    fontWeight={stats || yours ? "600" : "400"}
                    fill={stats || yours ? ink : muted}
                  >
                    {chartName}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
