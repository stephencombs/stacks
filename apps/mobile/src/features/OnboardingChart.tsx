import { sampleTrip } from "@stacks/client-runtime/sample";
import { MinorUnits } from "@stacks/contracts";
import { View } from "react-native";
import { Text } from "../components/ui/Text";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { Money } from "../components/Money";
import { chartCurve } from "../components/ui/chartCurve";
import { cn } from "../components/ui/cn";

const cards = [
  { title: "Session recap", figure: 34_000, caption: "Session result", result: true },
  { title: "Buy-in history", figure: 30_000, caption: "1 buy-in · 2 rebuys", result: false },
  { title: "Trip result", figure: 27_500, caption: "3 sessions · 2 nights", result: true },
  { title: "Group board", figure: null, caption: "Trip results", result: false },
] as const;

const plotWidth = 314;

export function OnboardingChart({ page, compact }: { page: 0 | 1 | 2 | 3; compact: boolean }) {
  const { title, figure, caption, result } = cards[page];

  const [blue, rule, muted, ink, surface, win, loss] = useCSSVariable([
    "--color-chip-blue",
    "--color-fill-strong",
    "--color-muted",
    "--color-ink",
    "--color-surface",
    "--color-win",
    "--color-loss",
  ]).map(String);

  const label = (
    value: string,
    x: number,
    y: number,
    anchor: "start" | "middle" | "end" = "start",
    color = muted,
  ) => (
    <SvgText x={x} y={y} textAnchor={anchor} fontFamily="Allo" fontSize={12} fill={color}>
      {value}
    </SvgText>
  );

  const grid = (x1: number, y1: number, x2: number, y2: number) => (
    <Line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={rule}
      strokeLinecap="round"
      strokeDasharray="0.3 3.5"
    />
  );

  const curve = [
    { x: 38, y: 64 },
    { x: 121, y: 88 },
    { x: 204, y: 77 },
    { x: 287, y: 12 },
  ];

  const plot = [
    <>
      {[73, 163, 253].map((x) => (
        <G key={x}>{grid(x, 12, x, 138)}</G>
      ))}
      {label("Buy-ins", 0, 42, "start", ink)}
      <Rect x={73} y={23} width={77} height={30} rx={3} fill={blue} opacity={0.8} />
      {label("$300", 314, 42, "end", ink)}
      {label("Cash-out", 0, 103, "start", ink)}
      <Rect x={73} y={84} width={165} height={30} rx={3} fill={blue} />
      {label("$640", 314, 103, "end", ink)}
      {label("$0", 73, 161, "middle")}
      {label("$350", 163, 161, "middle")}
      {label("$700", 253, 161, "middle")}
    </>,
    <>
      {[20, 71, 122].map((y) => (
        <G key={y}>{grid(40, y, 314, y)}</G>
      ))}
      {label("$100", 27, 24, "end")}
      {label("$50", 27, 75, "end")}
      {label("$0", 27, 126, "end")}
      {["9:41", "10:02", "10:28"].map((time, index) => (
        <G key={time}>
          <Rect x={50 + index * 89} y={20} width={61} height={102} rx={3} fill={blue} />
          {label(time, 80 + index * 89, 149, "middle")}
        </G>
      ))}
    </>,
    <>
      {grid(36, 8, 314, 8)}
      {grid(36, 64, 314, 64)}
      {grid(36, 91, 314, 91)}
      {label("+$300", 29, 12, "end")}
      {label("$0", 29, 68, "end")}
      {label("−$150", 29, 95, "end")}
      <Path d={chartCurve(curve)} fill="none" stroke={blue} strokeWidth={2} />
      <Circle cx={287} cy={12} r={5} fill={surface} stroke={blue} strokeWidth={2} />
      {label("Start", 38, 112, "middle")}
      {label("Session 1", 121, 112, "middle")}
      {label("Session 2", 204, 112, "middle")}
      {label("Session 3", 287, 112, "middle")}
    </>,
    <>
      {grid(191, 5, 191, 154)}
      {[
        { name: "You", value: "+$275", width: 88, positive: true },
        { name: "Maya", value: "+$110", width: 35, positive: true },
        { name: "Jordan", value: "−$40", width: 13, positive: false },
        { name: "Jamie", value: "−$145", width: 46, positive: false },
      ].map(({ name, value, width, positive }, index) => (
        <G key={name}>
          {label(name, 0, 25 + index * 34, "start", ink)}
          <Rect
            x={positive ? 191 : 191 - width}
            y={12 + index * 34}
            width={width}
            height={16}
            rx={3}
            fill={positive ? win : loss}
          />
          {label(value, 314, 25 + index * 34, "end", positive ? win : loss)}
        </G>
      ))}
    </>,
  ][page];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Example: ${title}, ${caption}`}
      className={cn(
        "rounded-[22px] border border-line bg-surface px-5 py-4",
        !compact && "min-h-[318px]",
      )}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="type-callout font-semibold text-ink">{title}</Text>
        <Text className="type-footnote text-muted">Example</Text>
      </View>
      {figure !== null ? (
        <Money
          amount={MinorUnits.make(figure)}
          currency={sampleTrip.currency}
          tone={result ? "result" : "plain"}
          className="mt-1 type-hero text-[40px] leading-[44px]"
        />
      ) : (
        <Text className="mt-1 type-hero text-[40px] leading-[44px] text-ink">4 players</Text>
      )}
      <Text className="type-footnote text-muted">{caption}</Text>
      <Svg
        width="100%"
        height={compact ? (page === 2 ? 75 : 113) : page === 2 ? 145 : 196}
        viewBox={`0 0 ${plotWidth} ${page === 2 ? 120 : 174}`}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {plot}
      </Svg>
      {page === 2 ? (
        <View className="flex-row justify-between gap-2 border-t border-line pt-2">
          {[
            ["Win rate", "67%"],
            ["Best session", "+$340"],
            ["Place", "1st of 4"],
          ].map(([name, value]) => (
            <View key={name} className="flex-1 gap-0.5">
              <Text className="type-footnote text-muted">{name}</Text>
              <Text
                className={
                  name === "Best session"
                    ? "type-footnote font-semibold text-win"
                    : "type-footnote font-semibold text-ink"
                }
              >
                {value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
