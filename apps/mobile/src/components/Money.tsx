import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { formatMoney } from "@stacks/shared/money";
import { Text } from "react-native";

import { cn } from "./ui/cn";

/**
 * An amount in the group's currency. `result` colors wins and losses and always shows the sign,
 * so the number reads correctly without the color.
 */
export function Money({
  amount,
  currency,
  tone = "plain",
  className,
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  tone?: "plain" | "result";
  className?: string;
}) {
  return (
    <Text
      className={cn(
        "font-mono",
        tone === "plain" && "text-ink",
        tone === "result" && amount > 0 && "text-win",
        tone === "result" && amount < 0 && "text-loss",
        tone === "result" && amount === 0 && "text-muted",
        className,
      )}
    >
      {formatMoney(amount, currency, { signDisplay: tone === "result" ? "exceptZero" : "auto" })}
    </Text>
  );
}

export function BalanceLabel({
  amount,
  currency,
  subject = "third",
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  subject?: "you" | "third";
}) {
  if (amount === 0) return <Text className="text-sm text-muted">Square</Text>;
  const verb =
    amount > 0
      ? subject === "you"
        ? "You're owed"
        : "Owed"
      : subject === "you"
        ? "You owe"
        : "Owes";
  return (
    <Text className={cn("text-sm tabular-nums", amount > 0 ? "text-win" : "text-loss")}>
      {verb} {formatMoney(MinorUnits.make(Math.abs(amount)), currency)}
    </Text>
  );
}
