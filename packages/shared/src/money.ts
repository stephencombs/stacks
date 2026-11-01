import * as Option from "effect/Option";
import { MinorUnits, type CurrencyCode } from "@stacks/contracts";

/** How many digits follow the decimal point: 2 for USD, 0 for JPY, 3 for KWD. */
export const minorUnitDigits = (currency: CurrencyCode): number =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

// Intl formats decimal strings exactly, so amounts never pass through a float.
const toDecimalString = (amount: MinorUnits, digits: number) => {
  const sign = amount < 0 ? "-" : "";
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");
  const decimal =
    digits === 0 ? magnitude : `${magnitude.slice(0, -digits)}.${magnitude.slice(-digits)}`;
  return `${sign}${decimal}` as Intl.StringNumericLiteral;
};

export const formatMoney = (
  amount: MinorUnits,
  currency: CurrencyCode,
  options: {
    readonly locale?: string;
    readonly signDisplay?: "auto" | "always" | "exceptZero";
  } = {},
): string =>
  new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency,
    signDisplay: options.signDisplay ?? "auto",
  }).format(toDecimalString(amount, minorUnitDigits(currency)));

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

const separators = (locale: string | undefined) => {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5);
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const group = parts.find((part) => part.type === "group")?.value ?? ",";
  // People type a plain space where the locale uses a no-break space; any whitespace is dropped.
  return { decimal, group: /\s/.test(group) ? null : group };
};

/**
 * Parses what a person types into an amount field: "1,234.50", "$20", "-15" or, in de-DE,
 * "1.234,50". Group separators count only between groups of three digits, so "1234.50" in de-DE
 * is rejected instead of read as 123450. Returns none for anything ambiguous, including more
 * decimals than the currency has.
 */
export const parseMoney = (
  input: string,
  currency: CurrencyCode,
  options: { readonly locale?: string } = {},
): Option.Option<MinorUnits> => {
  const { decimal, group } = separators(options.locale);
  const digits = minorUnitDigits(currency);
  const allowed = `\\d\\-−${escapeRegExp(decimal)}${group ? escapeRegExp(group) : ""}`;
  const cleaned = input.replace(new RegExp(`[^${allowed}]`, "g"), "").replace("−", "-");
  const whole = group ? `\\d{1,3}(?:${escapeRegExp(group)}\\d{3})+|\\d*` : `\\d*`;
  const match = new RegExp(`^(-?)(${whole})(?:${escapeRegExp(decimal)}(\\d*))?$`).exec(cleaned);
  if (!match) return Option.none();
  const [, sign = "", wholePart = "", fraction = ""] = match;
  if (wholePart === "" && fraction === "") return Option.none();
  if (fraction.length > digits) return Option.none();
  const integerDigits = group ? wholePart.replaceAll(group, "") : wholePart;
  return MinorUnits.makeOption(
    Number(`${sign}${integerDigits || "0"}${fraction.padEnd(digits, "0")}`),
  );
};
