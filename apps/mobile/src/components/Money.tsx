import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import { Text } from "./ui/Text";

import { formatDisplayMoney, HIDDEN_AMOUNT_LABEL, usePreferences } from "../lib/preferences";
import { cn } from "./ui/cn";

/**
 * An amount in the group's currency. `result` colors wins and losses and always shows the sign,
 * so the number reads correctly without the color. Privacy mode masks both the figure and the
 * win/loss tint; `hidden` overrides it, for a card that decides for itself.
 */
export function Money({
  amount,
  currency,
  tone = "plain",
  felt = false,
  fit = false,
  hidden: hiddenProp,
  testID,
  className,
}: {
  amount: MinorUnits;
  currency: CurrencyCode;
  tone?: "plain" | "result";
  felt?: boolean;
  /** Shrink to one line instead of wrapping, for a hero figure on a narrow phone. */
  fit?: boolean;
  /** Masks the amount whatever privacy mode says; by default it follows privacy mode. */
  hidden?: boolean;
  /** For the simulator E2E flows in apps/mobile/maestro. */
  testID?: string;
  className?: string;
}) {
  const prefs = usePreferences();
  const hidden = hiddenProp ?? prefs.privacyMode;

  const formatted = formatDisplayMoney(
    amount,
    currency,
    { ...prefs, privacyMode: hidden },
    {
      signDisplay: tone === "result" ? "exceptZero" : "auto",
    },
  );

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
                ? "text-felt-win"
                : amount < 0
                  ? "text-felt-loss"
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
