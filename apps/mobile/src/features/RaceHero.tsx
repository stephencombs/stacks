import { MinorUnits, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { around, lineScale, spreadLabels } from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { localClock, raceHeadline } from "@stacks/client-runtime/trip";
import { runningTotals } from "@stacks/shared/stats";
import { tripStandings } from "@stacks/shared/trips";
import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Glow } from "../components/ui/Glow";
import { cn } from "../components/ui/cn";

const HEIGHT = 128;
const PAD = { x: 16, y: 12 };
/** Room past the last point for each line's initial. */
const LABEL = 30;

/** The trip as a race, led by your gap to the next player, with everyone's running totals and yours in gold. */
export function RaceHero({ detail, trip }: { detail: GroupDetail; trip: TripDetail }) {
  const [accent, accentText, muted, ring] = useCSSVariable([
    "--color-accent",
    "--color-accent-text",
    "--color-muted",
    "--color-line-strong",
  ]).map(String);
  const [width, setWidth] = useState(0);
  const currency = detail.group.currency;
  const names = playerNames(detail);
  const me = detail.myPlayerId;
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const standings = tripStandings(closed, localClock);
  const head = raceHeadline(standings, me, names, currency);
  if (!head || closed.length === 0) return null;

  const lines = standings
    .toSorted((a, b) => a.rank - b.rank)
    .map((s) => ({ playerId: s.playerId, line: [0, ...runningTotals(closed, s.playerId)] }));
  const plot = lineScale(
    lines.map((l) => l.line),
    { width: Math.max(0, width - LABEL), height: HEIGHT },
    PAD,
    around(
      lines.findIndex((l) => l.playerId === me),
      lines.length,
    ),
  );
  // Yours draws last, on top of everyone else's.
  const drawn = lines.toSorted((a, b) => Number(a.playerId === me) - Number(b.playerId === me));
  const labels = spreadLabels(
    drawn.map(({ line }) => plot.y(line.at(-1)!)),
    13,
    { min: 6, max: HEIGHT - 6 },
  );

  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      <Glow tone={head.tone} />
      <View className="px-4 pt-4">
        <Text accessibilityRole="header" className="text-sm font-medium text-muted">
          {head.label}
        </Text>
        <Money
          amount={MinorUnits.make(head.gap ?? head.net)}
          currency={currency}
          tone={head.gap === null ? "result" : "plain"}
          fit
          className={cn(
            head.tone === "win" && "text-win",
            head.tone === "loss" && "text-loss",
            "mt-2 font-display text-6xl leading-[64px]",
          )}
        />
        {head.line ? <Text className="mt-1.5 text-sm text-muted">{head.line}</Text> : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-3 mb-4"
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.width);
          if (next !== width) setWidth(next);
        }}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Line
              x1={0}
              x2={width - LABEL}
              y1={plot.zero}
              y2={plot.zero}
              stroke={ring}
              strokeDasharray="3 4"
            />
            {drawn.map(({ playerId, line }, i) => {
              const yours = playerId === me;
              const end = { x: plot.x(line.length - 1), y: plot.y(line.at(-1)!) };
              const off = plot.clipped(line.at(-1)!);
              const color = yours ? accent : muted;
              return (
                <G key={playerId}>
                  <Polyline
                    points={plot.points(line)}
                    fill="none"
                    stroke={color}
                    strokeOpacity={yours ? 1 : 0.45}
                    strokeWidth={yours ? 3 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {yours ? (
                    <Circle cx={end.x} cy={end.y} r={10} fill={color} fillOpacity={0.2} />
                  ) : null}
                  <Circle cx={end.x} cy={end.y} r={yours ? 4.5 : 3} fill={color} />
                  <SvgText
                    x={end.x + 9}
                    y={labels[i]! + 4}
                    fontSize={12}
                    fontWeight={yours ? "600" : "400"}
                    fill={yours ? accentText : muted}
                  >
                    {(names.get(playerId) ?? "?").slice(0, 1).toUpperCase()}
                    {off === 1 ? " ↑" : off === -1 ? " ↓" : ""}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
    </View>
  );
}
