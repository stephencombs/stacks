import type { CurrencyCode } from "@stacks/contracts";
import { fromTop, netScale } from "@stacks/client-runtime/chart";
import { View } from "react-native";

import { cn } from "../components/ui/cn";

const HEIGHT = 192;

/**
 * Android and web have no native chart here, so each session is a bar from break-even to the
 * running total, like T3Code's usage chart.
 */
export function NetChartPlot({
  points,
}: {
  points: ReadonlyArray<{ readonly id: string; readonly total: number }>;
  currency: CurrencyCode;
}) {
  const scale = netScale([0, ...points.map((point) => point.total)]);
  const zero = fromTop(0, scale) * HEIGHT;

  return (
    <View style={{ height: HEIGHT }}>
      <View className="absolute inset-x-0 h-px bg-line-strong" style={{ top: zero }} />
      <View className="flex-1 flex-row gap-px">
        {points.map(({ id, total }) => {
          const top = fromTop(total, scale) * HEIGHT;
          return (
            <View key={id} className="relative flex-1">
              <View
                className={cn("absolute inset-x-0", total < 0 ? "bg-loss" : "bg-win")}
                style={{
                  top: Math.min(top, zero),
                  height: Math.max(Math.abs(top - zero), 1),
                  borderRadius: 2,
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
