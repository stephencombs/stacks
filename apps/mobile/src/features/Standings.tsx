import { MinorUnits, type GroupDetail, type GroupStats, type PlayerId } from "@stacks/contracts";
import { barTrack } from "@stacks/client-runtime/chart";
import { playerNames } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import { sessionCounts, type Subject } from "@stacks/shared/results";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Money } from "../components/Money";
import { List } from "../components/ui/Surface";
import { cn } from "../components/ui/cn";

/**
 * Everyone ranked by all-time net, each with a bar from break-even, and the group's total.
 * Each row picks whose stats the rest of the screen shows.
 */
export function Standings({
  detail,
  stats,
  me,
  selected,
  onSelect,
}: {
  detail: GroupDetail;
  stats: GroupStats;
  me: PlayerId;
  selected: Subject;
  onSelect: (subject: Subject) => void;
}) {
  const names = playerNames(detail);
  const currency = detail.group.currency;
  const played = sessionCounts(stats.bySession);
  const ranked = stats.byPlayer.toSorted((a, b) => b.net - a.net);
  const track = barTrack(ranked.map((result) => result.net));
  const total = MinorUnits.make(ranked.reduce((sum, result) => sum + result.net, 0));
  const sessions = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;
  const signed = (amount: MinorUnits) =>
    formatMoney(amount, currency, { signDisplay: "exceptZero" });

  return (
    <List>
      {ranked.map((result, index) => {
        const you = result.playerId === me;
        const name = names.get(result.playerId) ?? "";
        const summary = `${sessions(played.get(result.playerId) ?? 0)}${result.buyIn > 0 ? ` · bought in ${formatMoney(result.buyIn, currency)}` : ""}`;
        const width = `${track.extent(result.net) * 100}%` as const;
        return (
          <Choice
            key={result.playerId}
            label={`${index + 1}. ${name}${you ? ", you" : ""}: ${signed(result.net)}, ${summary}`}
            selected={selected === result.playerId}
            onSelect={() => onSelect(result.playerId)}
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
          </Choice>
        );
      })}
      <Choice
        label={`Group total: ${signed(total)}, ${sessions(stats.sessionCount)}`}
        selected={selected === "group"}
        onSelect={() => onSelect("group")}
      >
        <View className="flex-row items-baseline gap-3">
          <View className="w-5" />
          <View className="flex-1">
            <Text className="text-base font-medium text-ink">Group total</Text>
            <Text className="text-sm text-muted tabular-nums">{sessions(stats.sessionCount)}</Text>
          </View>
          <Money amount={total} currency={currency} tone="result" className="font-serif text-xl" />
        </View>
      </Choice>
    </List>
  );
}

function Choice({
  label,
  selected,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows their stats below"
      accessibilityState={{ selected }}
      onPress={onSelect}
      className={cn(
        "gap-2 border-t border-line px-4 py-3.5",
        selected ? "bg-sunken" : "active:bg-sunken",
      )}
    >
      {children}
    </Pressable>
  );
}
