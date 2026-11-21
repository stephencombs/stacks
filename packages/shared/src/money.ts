import * as Option from "effect/Option";
import { MinorUnits, type CurrencyCode } from "@stacks/contracts";

/** How many digits follow the decimal point: 2 for USD, 0 for JPY, 3 for KWD. */
export const minorUnitDigits = (currency: CurrencyCode) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits ?? 2;

const toDecimalString = (amount: MinorUnits, digits: number) => {
  const sign = amount < 0 ? "-" : "";
  const magnitude = String(Math.abs(amount)).padStart(digits + 1, "0");

  const decimal =
    digits === 0 ? magnitude : `${magnitude.slice(0, -digits)}.${magnitude.slice(-digits)}`;

  // SAFETY: magnitude is the digits of an integer amount, so this is a canonical decimal literal.
  return `${sign}${decimal}` as Intl.StringNumericLiteral;
};

export const formatDecimal = (amount: MinorUnits, currency: CurrencyCode) =>
  toDecimalString(amount, minorUnitDigits(currency));

export const formatMoney = (
  amount: MinorUnits,
  currency: CurrencyCode,
  options: {
    readonly locale?: string;
    readonly signDisplay?: "auto" | "always" | "exceptZero";
    readonly trailingZeroDisplay?: "auto" | "stripIfInteger";
  } = {},
) => {
  const digits = minorUnitDigits(currency);

  const whole =
    (options.trailingZeroDisplay ?? "stripIfInteger") === "stripIfInteger" &&
    amount % 10 ** digits === 0;

  const signDisplay =
    amount === 0 && options.signDisplay === "exceptZero" ? "auto" : options.signDisplay;

  const format: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    signDisplay: signDisplay ?? "auto",
  };

  if (whole) {
    format.minimumFractionDigits = 0;
    format.maximumFractionDigits = 0;
  }

  const formatted = new Intl.NumberFormat(options.locale, format).format(
    toDecimalString(amount, digits),
  );
  const needsPlus =
    (signDisplay === "always" && amount >= 0) || (signDisplay === "exceptZero" && amount > 0);

  return needsPlus && !formatted.includes("+") ? `+${formatted}` : formatted;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

const separators = (locale: string | undefined) => {
  const marks = new Intl.NumberFormat(locale).format(1234567.5).replace(/\d/g, "");
  const decimal = marks.at(-1) ?? ".";
  const group = marks.length > 1 ? marks[0]! : ",";

  return { decimal, group: /\s/.test(group) ? null : group };
};

/** The locale's decimal mark, as someone types it on a keypad. */
export const decimalSeparator = (locale?: string) => separators(locale).decimal;

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
) => {
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
