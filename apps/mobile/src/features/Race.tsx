import type { CurrencyCode, PlayerId } from "@stacks/contracts";
import {
  around,
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
import { PanResponder, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Choice } from "../components/ui/Field";
import { cn } from "../components/ui/cn";
import { HIDDEN_AMOUNT_LABEL, usePreferences } from "../lib/preferences";

const label = "text-sm";

type Racer = { readonly playerId: PlayerId; readonly name: string };

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
/** Clear of the card edge, so a rounded clip can't take the first character. */
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
}: {
  sessions: ReadonlyArray<S>;
  players: ReadonlyArray<Racer>;
  currency: CurrencyCode;
  picked: PlayerId;
  marks: ReadonlyArray<Mark>;
  where: (session: S) => string;
  /** The heading's lead-in at the latest session. */
  latest: string;
}) {
  const last = sessions.length - 1;
  // Unpinned, the race follows the latest session, including ones that arrive while it's open.
  const [pinned, setPinned] = useState<number | null>(null);
  const at = pinned === null ? last : Math.min(pinned, last);
  const setAt = (next: number) => setPinned(next >= last ? null : next);
  const [measure, setMeasure] = useState<RaceMeasure>("money");
  const prefs = usePreferences();
  const [width, setWidth] = useState(0);
  const [ink, muted, ring] = useCSSVariable([
    "--color-ink",
    "--color-muted",
    "--color-fill-strong",
  ]).map(String);

  const lines = raceLines(
    sessions,
    players.map((p) => p.playerId),
    measure,
  ).map((line, i) => ({ ...line, ...players[i]! }));
  const chartNames = new Map(
    players.map(({ playerId, name }) => [playerId, name.trim().split(/\s+/)[0] || name]),
  );
  const labelSpace = Math.min(
    100,
    Math.max(30, ...[...chartNames.values()].map((name) => labelWidth(name, LETTER) + 24)),
  );
  const plot = lineScale(
    lines.map((l) => l.line),
    { width: Math.max(0, width - labelSpace), height: HEIGHT },
    PAD,
    around(
      lines.findIndex((l) => l.playerId === picked),
      lines.length,
    ),
  );
  const standing = lines
    .map((l) => ({ ...l, now: l.values[at]! }))
    .toSorted((a, b) => (b.now ?? -Infinity) - (a.now ?? -Infinity));
  const [leader, second] = standing;
  const session = sessions[at]!;
  // Yours draws last, on top of everyone else's.
  const drawn = lines.toSorted(
    (a, b) => Number(a.playerId === picked) - Number(b.playerId === picked),
  );
  const point = at + 1;
  const labels = spreadLabels(
    drawn.map(({ line }) => plot.y(line[point]!)),
    LETTER + 6,
    { min: LETTER, max: HEIGHT - LETTER },
  );
  const edges = { min: INSET, max: Math.max(INSET, width - INSET) };
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
  // Only a sideways drag scrubs; an up-or-down swipe that starts on the chart scrolls the page.
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
        className="overflow-hidden rounded-xl bg-surface"
        style={{ height: HEIGHT + MARKS }}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT + MARKS} pointerEvents="none">
            <Line
              x1={0}
              x2={width - labelSpace}
              y1={plot.zero}
              y2={plot.zero}
              stroke={ring}
              strokeDasharray="3 4"
            />
            {marks.map((mark) => {
              const place = placeLabel(
                plot.x(mark.index + 1),
                labelWidth(mark.label, MARK_FONT),
                edges,
              );
              return (
                <SvgText
                  key={mark.index}
                  x={place.x}
                  y={HEIGHT + MARKS - 8}
                  textAnchor={place.anchor}
                  fill={muted}
                  fontSize={MARK_FONT}
                >
                  {mark.label}
                </SvgText>
              );
            })}
            <Line
              x1={plot.x(point)}
              x2={plot.x(point)}
              y1={PAD.y / 2}
              y2={HEIGHT - PAD.y / 2}
              stroke={ring}
            />
            {drawn.map(({ playerId, line }, i) => {
              const yours = playerId === picked;
              const color = yours ? ink : muted;
              const points = line.map((v, i) => `${plot.x(i)},${plot.y(v)}`);
              const now = { x: plot.x(point), y: plot.y(line[point]!) };
              const off = plot.clipped(line[point]!);
              const chartName =
                chartNames.get(playerId)! + (off === 1 ? " ↑" : off === -1 ? " ↓" : "");
              const seatWidth = labelWidth(chartName, LETTER);
              const seat = placeLabel(now.x + 9 + seatWidth / 2, seatWidth, edges);
              return (
                <G key={playerId}>
                  <Polyline
                    points={points.slice(point).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.15}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                  <Polyline
                    points={points.slice(0, point + 1).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeOpacity={yours ? 1 : 0.45}
                    strokeWidth={yours ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {yours ? (
                    <Circle cx={now.x} cy={now.y} r={10} fill={color} fillOpacity={0.2} />
                  ) : null}
                  <Circle cx={now.x} cy={now.y} r={yours ? 4.5 : 3} fill={color} />
                  <SvgText
                    x={seat.x}
                    y={labels[i]! + 4}
                    textAnchor={seat.anchor}
                    fontSize={LETTER}
                    fontWeight={yours ? "600" : "400"}
                    fill={yours ? ink : muted}
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
