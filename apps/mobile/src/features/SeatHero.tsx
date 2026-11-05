import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import type { PlayerResult } from "@stacks/shared/results";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { Money } from "../components/Money";
import { Glow } from "../components/ui/Glow";
import { cn } from "../components/ui/cn";
import { Chip } from "./Chip";

const FIGURE = "font-display text-5xl leading-[52px]";

/**
 * The seat this session is about, usually yours: what you have in, or how you finished.
 */
export function SeatHero({
  name,
  chip,
  seat,
  you,
  result,
  live,
  out,
  currency,
}: {
  name: string;
  chip: number;
  seat: number | undefined;
  you: boolean;
  result: PlayerResult | undefined;
  live: boolean;
  out: boolean;
  currency: CurrencyCode;
}) {
  const bought = result !== undefined && result.buyIn > 0;
  const final = result !== undefined && (!live || out);
  const net = result?.net ?? MinorUnits.make(0);
  const label = [you ? "Your seat" : `${name}'s seat`, seat === undefined ? null : `seat ${seat}`]
    .filter(Boolean)
    .join(" · ");

  let figure: ReactNode;
  if (final)
    figure = <Money amount={net} currency={currency} tone="result" fit className={FIGURE} />;
  else if (bought)
    figure = (
      <View className="flex-row items-baseline gap-2">
        <Money amount={result.buyIn} currency={currency} fit className={FIGURE} />
        <Text className="text-lg text-muted">in</Text>
      </View>
    );
  else figure = <Text className={cn(FIGURE, "text-muted")}>Not in yet</Text>;

  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      <Glow tone={final ? (net > 0 ? "win" : net < 0 ? "loss" : "accent") : "accent"} />
      <View className="p-4">
        <View className="flex-row items-center gap-3">
          <Chip chip={chip} name={name} size={40} />
          <View className="min-w-0 flex-1">
            <Text accessibilityRole="header" className="text-sm font-medium text-muted">
              {label}
            </Text>
            {figure}
          </View>
        </View>
        {final ? (
          <Text className="mt-2 text-sm text-muted">
            In {formatMoney(result.buyIn, currency)} · Out {formatMoney(result.cashOut, currency)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
