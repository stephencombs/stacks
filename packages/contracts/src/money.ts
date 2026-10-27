import * as Schema from "effect/Schema";

export const CurrencyCode = Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/)).pipe(
  Schema.brand("CurrencyCode"),
);
export type CurrencyCode = typeof CurrencyCode.Type;

/**
 * An amount in the currency's smallest unit (cents for USD, yen for JPY).
 * `Schema.Int` only accepts safe integers, so sums that overflow fail loudly.
 */
export const MinorUnits = Schema.Int.pipe(Schema.brand("MinorUnits"));
export type MinorUnits = typeof MinorUnits.Type;
