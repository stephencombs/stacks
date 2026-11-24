import type { TripCardModel } from "@stacks/client-runtime/shareCard";
import { lineScale } from "@stacks/client-runtime/chart";
import { ordinal } from "@stacks/client-runtime/trip";
import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { Text } from "../components/ui/Text";
import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";
import { CardFrame } from "./ShareCardFrame";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const LINE = { width: 120, height: 48 };

/** A trip as an image: who finished where, and how it went for you. Draws only what the model holds. */
export function TripCard({ model }: { model: TripCardModel }) {
  const { you } = model;
  const amounts = you?.amounts ?? null;

  return (
    <CardFrame>
      <View className="gap-1">
        <Text numberOfLines={1} className="type-title text-felt-ink">
          {model.name}
        </Text>
        <Text numberOfLines={1} className="type-footnote text-felt-soft">
          {[model.dates, ...model.venues].join(" · ")}
        </Text>
      </View>
      <View className="gap-1">
        {model.rows.map((row) => (
          <View
            key={row.playerId}
            className={cn(
              "h-7 flex-row items-center gap-2 rounded-lg px-2",
              row.isYou && "bg-felt-ink/10",
            )}
          >
            <Text className="w-5 type-footnote text-felt-soft tabular-nums">{row.rank}</Text>
            <Chip chip={row.chip} name={row.name} size={22} />
            <Text
              numberOfLines={1}
              className={cn(
                "min-w-0 flex-1 type-footnote text-felt-ink",
                row.isYou ? "font-bold" : "font-medium",
              )}
            >
              {row.isYou ? `${row.name} · You` : row.name}
            </Text>
            {row.net === null ? null : (
              <Money
                amount={row.net}
                currency={model.currency}
                tone="result"
                felt
                hidden={false}
                className="type-footnote font-semibold"
              />
            )}
          </View>
        ))}
        {model.more > 0 ? (
          <Text className="px-2 type-footnote text-felt-soft">+{model.more} more</Text>
        ) : null}
      </View>
      {you ? (
        <View className="flex-row items-end justify-between gap-3 border-t border-felt-ink/15 pt-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="type-label text-felt-soft">
              {amounts ? "Your result" : "Your place"}
            </Text>
            {amounts ? (
              <Money
                amount={amounts.net}
                currency={model.currency}
                tone="result"
                felt
                hidden={false}
                fit
                className="type-title"
              />
            ) : (
              <Text className="type-title text-felt-ink">{ordinal(you.rank)}</Text>
            )}
            <Text numberOfLines={1} className="type-footnote text-felt-soft">
              {[
                amounts ? ordinal(you.rank) : null,
                plural(you.sessions, "session"),
                plural(you.nights, "night"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {amounts?.climb ? (
              <Text numberOfLines={1} className="type-footnote text-felt-soft">
                {amounts.climb}
              </Text>
            ) : null}
          </View>
          {amounts ? <RunningLine line={amounts.line} net={amounts.net} /> : null}
        </View>
      ) : null}
    </CardFrame>
  );
}

function RunningLine({ line, net }: { line: ReadonlyArray<number>; net: number }) {
  const [color, zero] = useCSSVariable([
    net === 0 ? "--color-felt-ink" : `--color-felt-${net < 0 ? "loss" : "win"}`,
    "--color-felt-ink",
  ]).map(String);

  const plot = lineScale([line], LINE, { x: 6, y: 6 });
  const end = { x: plot.x(line.length - 1), y: plot.y(line.at(-1)!) };

  return (
    <Svg width={LINE.width} height={LINE.height}>
      <Line
        x1={0}
        x2={LINE.width}
        y1={plot.zero}
        y2={plot.zero}
        stroke={zero}
        strokeOpacity={0.4}
        strokeDasharray="3 4"
      />
      <Polyline
        points={plot.points(line)}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={end.x} cy={end.y} r={4} fill={color} />
    </Svg>
  );
}
