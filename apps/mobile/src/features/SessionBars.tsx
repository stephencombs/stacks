import type { CurrencyCode, GroupStats, PlayerId } from "@stacks/contracts";
import { formatDay, runsLine, winRate } from "@stacks/client-runtime/format";
import { runningNet, sessionRuns } from "@stacks/shared/results";
import { Text, View } from "react-native";

import { SessionBarsPlot } from "./SessionBarsPlot";

/** A player's result in each closed session, oldest on the left, with streaks underneath. */
export function SessionBars({
  stats,
  playerId,
  currency,
}: {
  stats: GroupStats;
  playerId: PlayerId;
  currency: CurrencyCode;
}) {
  const points = runningNet(stats.bySession, playerId);
  if (points.length === 0) {
    return (
      <Text className="text-sm text-muted">Each session you play shows up here as a bar.</Text>
    );
  }
  const runs = sessionRuns(points.map((point) => point.net));
  const rate = winRate(runs);
  const first = points[0]!;
  const last = points.at(-1)!;

  return (
    <View
      accessible
      accessibilityLabel={`${rate.count} sessions, ${rate.percent}. ${runsLine(runs)}.`}
      className="gap-4"
    >
      <View className="gap-0.5">
        <Text className="text-sm text-muted">{rate.count}</Text>
        <Text className="font-serif text-3xl text-ink tabular-nums">
          {rate.percent}
          <Text className="font-sans text-base text-muted"> winning sessions</Text>
        </Text>
      </View>
      <SessionBarsPlot
        points={points.map((point) => ({ id: point.session.sessionId, net: point.net }))}
        currency={currency}
      />
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted">{formatDay(first.session.startedAt)}</Text>
        {points.length > 1 ? (
          <Text className="text-xs text-muted">{formatDay(last.session.startedAt)}</Text>
        ) : null}
      </View>
      <Text className="text-sm text-muted tabular-nums">{runsLine(runs)}</Text>
    </View>
  );
}
