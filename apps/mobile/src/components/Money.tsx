import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { Text } from "react-native";

import { formatDisplayMoney, HIDDEN_AMOUNT_LABEL, usePreferences } from "../lib/preferences";
import { cn } from "./ui/cn";

/**
 * An amount in the group's currency. `result` colors wins and losses and always shows the sign,
 * so the number reads correctly without the color. Privacy mode masks both the figure and the
 * win/loss tint.
 */
export function Money({
  amount,
  currency,
  tone = "plain",
  felt = false,
  fit = false,
  testID,
  className,
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  tone?: "plain" | "result";
  felt?: boolean;
  /** Shrink to one line instead of wrapping, for a hero figure on a narrow phone. */
  fit?: boolean;
  /** For the simulator E2E flows in apps/mobile/maestro. */
  testID?: string;
  className?: string;
}) {
  const prefs = usePreferences();
  const hidden = prefs.privacyMode;

  const formatted = formatDisplayMoney(amount, currency, prefs, {
    signDisplay: tone === "result" ? "exceptZero" : "auto",
  });

  return (
    <Text
      testID={testID}
      accessibilityLabel={hidden ? HIDDEN_AMOUNT_LABEL : formatted}
      numberOfLines={fit ? 1 : undefined}
      adjustsFontSizeToFit={fit}
      className={cn(
        "font-sans tabular-nums",
        hidden
          ? felt
            ? "text-felt-soft"
            : "text-muted"
          : tone === "plain"
            ? felt
              ? "text-felt-ink"
              : "text-ink"
            : felt
              ? amount > 0
                ? "text-[#6EE7B7]"
                : amount < 0
                  ? "text-[#FCA5A5]"
                  : "text-felt-soft"
              : amount > 0
                ? "text-win"
                : amount < 0
                  ? "text-loss"
                  : "text-muted",
        !hidden && className,
        hidden && className?.replace(/\btext-(?:ink|win|loss|felt-ink)\b/g, ""),
      )}
    >
      {formatted}
    </Text>
  );
}
