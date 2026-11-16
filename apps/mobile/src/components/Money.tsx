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
  fit = false,
  className,
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  tone?: "plain" | "result";
  /** Shrink to one line instead of wrapping, for a hero figure on a narrow phone. */
  fit?: boolean;
  className?: string;
}) {
  return (
    <Text
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit}
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
