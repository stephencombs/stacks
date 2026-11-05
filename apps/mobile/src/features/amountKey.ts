import { type CurrencyCode, type MinorUnits } from "@stacks/contracts";
import { parseMoney } from "@stacks/shared/money";
import * as Option from "effect/Option";

/** One key from the table keypad, applied to the amount string someone is typing. */
export function applyAmountKey(amount: string, key: string, decimal: string): string {
  if (key === "back") return amount.slice(0, -1);
  if (key === "sign") return amount.startsWith("-") ? amount.slice(1) : `-${amount}`;
  if (key === decimal && amount.includes(decimal)) return amount;
  return amount === "0" && key !== decimal ? key : amount + key;
}

/** Empty is missing and zero is a bust. Negative doesn't count. */
export function readCashOut(text: string, currency: CurrencyCode): MinorUnits | null {
  const amount = Option.getOrNull(parseMoney(text, currency));
  if (amount === null || amount < 0) return null;
  return amount;
}
