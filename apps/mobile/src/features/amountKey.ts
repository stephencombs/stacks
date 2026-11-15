import { type CurrencyCode, type MinorUnits } from "@stacks/contracts";
import { parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";

export { applyAmountKey } from "@stacks/client-runtime/recordingView";

/** Empty is missing and zero is a bust. Negative doesn't count. */
export function readCashOut(text: string, currency: CurrencyCode): MinorUnits | null {
  const amount = Option.getOrNull(parseMoney(text, currency));
  if (amount === null || amount < 0) return null;
  return amount;
}
