import type { CurrencyCode, GroupStats } from "@stacks/contracts";
import { formatDay } from "@stacks/client-runtime/format";
import { formatMoney } from "@stacks/shared/money";
import { runningNet, type Subject } from "@stacks/shared/results";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { NetChartPlot } from "./NetChartPlot";

/** A player's or the group's running net over the group's closed sessions, oldest on the left. */
export function NetChart({
  stats,
  subject,
  whose,
  currency,
}: {
  stats: GroupStats;
  subject: Subject;
  /** "Your", "Nick's" or "The group's", from `whose` in client-runtime. */
  whose: string;
  currency: CurrencyCode;
}) {
  const points = runningNet(stats.bySession, subject);
  if (points.length === 0) {
    return (
      <Text className="text-sm text-muted">
        A running total shows up here after a finished session.
      </Text>
    );
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  const sessions = `${points.length} ${points.length === 1 ? "session" : "sessions"}`;

  return (
    <View
      accessible
      accessibilityLabel={`${whose} net after ${sessions}: ${formatMoney(last.total, currency, { signDisplay: "exceptZero" })}`}
      className="gap-4"
    >
      <View className="gap-0.5">
        <Text className="text-sm text-muted">After {sessions}</Text>
        <Money
          amount={last.total}
          currency={currency}
          tone="result"
          className="font-serif text-3xl"
        />
      </View>
      <NetChartPlot
        points={points.map((point) => ({ id: point.session.sessionId, total: point.total }))}
        currency={currency}
      />
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted">{formatDay(first.session.startedAt)}</Text>
        {points.length > 1 ? (
          <Text className="text-xs text-muted">{formatDay(last.session.startedAt)}</Text>
        ) : null}
      </View>
    </View>
  );
}
