import type { CurrencyCode } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { View } from "react-native";

import { cn } from "../components/ui/cn";

const HEIGHT = 160;

/** Android and web have no native chart here, so each session is a bar from break-even. */
export function SessionBarsPlot({
  points,
}: {
  points: ReadonlyArray<{ readonly id: string; readonly net: number }>;
  currency: CurrencyCode;
}) {
  const track = barTrack(points.map((point) => point.net));
  const zero = (1 - track.zero) * HEIGHT;

  return (
    <View style={{ height: HEIGHT }}>
      <View className="absolute inset-x-0 h-px bg-line-strong" style={{ top: zero }} />
      <View className="flex-1 flex-row gap-px">
        {points.map(({ id, net }) => {
          const height = Math.max(track.extent(net) * HEIGHT, 2);
          return (
            <View key={id} className="relative flex-1">
              <View
                className={cn("absolute inset-x-0", net < 0 ? "bg-loss" : "bg-win")}
                style={{ top: net < 0 ? zero : zero - height, height, borderRadius: 2 }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
