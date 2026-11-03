import { MinorUnits, type GroupDetail, type TripDetail } from "@stacks/contracts";
import { lineScale } from "@stacks/client-runtime/chart";
import { localClock, ordinal, tripLines } from "@stacks/client-runtime/trip";
import { playerTrip, tripNights, tripStandings } from "@stacks/shared/trips";
import { useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Glow } from "../components/ui/Glow";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const HEIGHT = 96;

/** Your trip at a glance: where you stand, the line you drew getting there, and how it went. */
export function TripHero({ group, trip }: { group: GroupDetail; trip: TripDetail }) {
  const currency = group.group.currency;
  const closed = trip.sessions.filter((s) => s.session.status === "closed");
  const mine = playerTrip(closed, group.myPlayerId);
  const tone = mine.net > 0 ? "win" : mine.net < 0 ? "loss" : "accent";
  const [color, ring] = useCSSVariable([`--color-${tone}`, "--color-line-strong"]).map(String);
  const [width, setWidth] = useState(0);
  if (mine.played === 0) return null;
  const standings = tripStandings(closed, localClock);
  const rank = standings.find((s) => s.playerId === group.myPlayerId)?.rank;
  const lines = tripLines(mine, currency);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };
  const plot = lineScale([mine.line], { width, height: HEIGHT }, { x: 8, y: 10 });
  const points = plot.points(mine.line);
  const end = { x: plot.x(mine.line.length - 1), y: plot.y(mine.line.at(-1)!) };

  return (
    <View onLayout={onLayout} className="overflow-hidden rounded-3xl bg-surface">
      <Glow tone={tone} />
      <View className="gap-1 px-5 pt-5">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="type-label text-muted">
            Your trip
          </Text>
          <Text className="text-sm text-muted">
            {plural(mine.played, "session")} ·{" "}
            {plural(tripNights(closed, localClock).length, "night")}
          </Text>
        </View>
        <Money
          amount={MinorUnits.make(mine.net)}
          currency={currency}
          tone="result"
          className="font-display text-6xl leading-[64px]"
        />
        {lines.climb ? <Text className="text-sm text-muted">{lines.climb}</Text> : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-3"
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Line
              x1={0}
              x2={width}
              y1={plot.zero}
              y2={plot.zero}
              stroke={ring}
              strokeDasharray="3 4"
            />
            <Polygon
              points={`${plot.x(0)},${HEIGHT} ${points} ${end.x},${HEIGHT}`}
              fill="url(#fill)"
            />
            <Polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Circle cx={end.x} cy={end.y} r={10} fill={color} fillOpacity={0.2} />
            <Circle cx={end.x} cy={end.y} r={4.5} fill={color} />
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </View>
      <View className="flex-row border-t border-line">
        <Tile label="Win rate">
          <Text className="font-mono text-lg text-ink">{lines.winRate}</Text>
        </Tile>
        <Tile label="Best" divided>
          {mine.best ? (
            <Money
              amount={MinorUnits.make(mine.best.net)}
              currency={currency}
              tone="result"
              className="text-lg"
            />
          ) : (
            <Text className="font-mono text-lg text-ink">–</Text>
          )}
        </Tile>
        <Tile label="Board" divided>
          <Text className="font-mono text-lg text-accent-text">
            {rank === undefined ? "–" : ordinal(rank)}
            <Text className="text-sm text-muted"> of {standings.length}</Text>
          </Text>
        </Tile>
      </View>
    </View>
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
    <View
      accessible
      className={
        divided ? "flex-1 gap-0.5 border-l border-line px-4 py-3" : "flex-1 gap-0.5 px-5 py-3"
      }
    >
      <Text className="type-label text-muted">{label}</Text>
      {children}
    </View>
  );
}
