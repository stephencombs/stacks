import type { GroupDetail, GroupStats, PlayerId } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import { sessionCounts } from "@stacks/shared/results";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { List } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";

/** Everyone ranked by all-time net, each with a bar from break-even. */
export function Standings({
  detail,
  stats,
  me,
}: {
  detail: GroupDetail;
  stats: GroupStats;
  me: PlayerId;
}) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const played = sessionCounts(stats.bySession);
  const ranked = stats.byPlayer.toSorted((a, b) => b.net - a.net);
  const track = barTrack(ranked.map((result) => result.net));

  return (
    <List>
      {ranked.map((result, index) => {
        const you = result.playerId === me;
        const name = names.get(result.playerId) ?? "";
        const sessions = played.get(result.playerId) ?? 0;
        const summary = `${sessions} ${sessions === 1 ? "session" : "sessions"}${result.buyIn > 0 ? ` · bought in ${formatMoney(result.buyIn, currency)}` : ""}`;
        const width = `${track.extent(result.net) * 100}%` as const;
        return (
          <View
            key={result.playerId}
            accessible
            accessibilityLabel={`${index + 1}. ${name}${you ? ", you" : ""}: ${formatMoney(result.net, currency, { signDisplay: "exceptZero" })}, ${summary}`}
            className={cn("gap-2 border-t border-line px-4 py-3.5", you && "bg-sunken")}
          >
            <View className="flex-row items-baseline gap-3">
              <Text className="w-5 text-sm text-muted tabular-nums">{index + 1}</Text>
              <View className="flex-1">
                <Text numberOfLines={1} className="text-base font-medium text-ink">
                  {name}
                  {you ? <Text className="font-normal text-muted"> · you</Text> : null}
                </Text>
                <Text className="text-sm text-muted tabular-nums">{summary}</Text>
              </View>
              <Money
                amount={result.net}
                currency={currency}
                tone="result"
                className="font-serif text-xl"
              />
            </View>
            <View className="ml-8 h-1.5 overflow-hidden rounded-full bg-line">
              <View
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  result.net >= 0 ? "bg-win" : "bg-loss",
                )}
                style={
                  result.net >= 0
                    ? { left: `${track.zero * 100}%`, width }
                    : { right: `${(1 - track.zero) * 100}%`, width }
                }
              />
            </View>
          </View>
        );
      })}
    </List>
  );
}
