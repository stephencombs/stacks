import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { CurrencyCode } from "@stacks/contracts";

import { formatMoney, minorUnitDigits, parseMoney } from "./money.ts";
import { money } from "./testing/ledgerArbitrary.ts";

const USD = CurrencyCode.make("USD");
const EUR = CurrencyCode.make("EUR");
const JPY = CurrencyCode.make("JPY");
const KWD = CurrencyCode.make("KWD");

describe("minorUnitDigits", () => {
  it("follows the currency", () => {
    expect([USD, JPY, KWD].map(minorUnitDigits)).toEqual([2, 0, 3]);
  });
});

describe("formatMoney", () => {
  it("formats minor units in the currency", () => {
    expect(formatMoney(money(123456), USD, { locale: "en-US" })).toBe("$1,234.56");
    expect(formatMoney(money(-500), USD, { locale: "en-US" })).toBe("-$5.00");
    expect(formatMoney(money(1500), JPY, { locale: "en-US" })).toBe("¥1,500");
    expect(formatMoney(money(1234), KWD, { locale: "en-US" })).toBe("KWD\u00a01.234");
  });

  it("shows a plus sign on request", () => {
    expect(formatMoney(money(1000), USD, { locale: "en-US", signDisplay: "always" })).toBe(
      "+$10.00",
    );
  });

  it("stays exact at the largest safe amount", () => {
    expect(formatMoney(money(Number.MAX_SAFE_INTEGER), USD, { locale: "en-US" })).toBe(
      "$90,071,992,547,409.91",
    );
  });
});

describe("parseMoney", () => {
  it.each([
    ["20", 2000],
    ["$20", 2000],
    ["$ 1,234.5", 123450],
    ["-15.25", -1525],
    ["-$15.25", -1525],
    [".5", 50],
    ["20.", 2000],
  ])("reads %j in en-US dollars", (input, expected) => {
    expect(parseMoney(input, USD, { locale: "en-US" })).toEqual(Option.some(expected));
  });

  it.each(["", "-", "abc", "1,00", "12,34,567", "1.234", "1-2", "--5"])(
    "rejects %j in en-US dollars",
    (input) => {
      expect(parseMoney(input, USD, { locale: "en-US" })).toEqual(Option.none());
    },
  );

  it("follows the locale's separators", () => {
    expect(parseMoney("1.234,50 €", EUR, { locale: "de-DE" })).toEqual(Option.some(123450));
    expect(parseMoney("12,5", EUR, { locale: "de-DE" })).toEqual(Option.some(1250));
    expect(parseMoney("1 234,50", EUR, { locale: "fr-FR" })).toEqual(Option.some(123450));
  });

  it("rejects a decimal point that the locale uses for grouping", () => {
    expect(parseMoney("1234.50", EUR, { locale: "de-DE" })).toEqual(Option.none());
  });

  it("rejects fractions a currency doesn't have", () => {
    expect(parseMoney("1,500", JPY, { locale: "en-US" })).toEqual(Option.some(1500));
    expect(parseMoney("1.5", JPY, { locale: "en-US" })).toEqual(Option.none());
  });

  it("rejects amounts too large to store exactly", () => {
    expect(parseMoney("900719925474099.92", USD, { locale: "en-US" })).toEqual(Option.none());
  });

  const Amount = Schema.Int.check(Schema.isBetween({ minimum: -1e13, maximum: 1e13 }));

  it.prop("reads back whatever it formats", [Amount], ([amount]) => {
    for (const [currency, locale] of [
      [USD, "en-US"],
      [EUR, "de-DE"],
      [JPY, "ja-JP"],
      [EUR, "fr-FR"],
    ] as const) {
      const formatted = formatMoney(money(amount), currency, { locale });
      expect(parseMoney(formatted, currency, { locale })).toEqual(Option.some(amount));
    }
  });
});
