import { describe, expect, it } from "@effect/vitest";
import { CurrencyCode, MinorUnits, PlayerId, type PaymentHandles } from "@stacks/contracts";

import {
  formatSettleUpShare,
  parsePaymentHandlesForm,
  payLinks,
  paymentHandlesList,
} from "./pay.ts";

const usd = CurrencyCode.make("USD");
const cad = CurrencyCode.make("CAD");
const jpy = CurrencyCode.make("JPY");
const kwd = CurrencyCode.make("KWD");

const allHandles: PaymentHandles = {
  venmo: "bea-smith",
  cashApp: "beaCash",
  paypal: "beaPay",
};

describe("payLinks", () => {
  it("builds Venmo, Cash App, and PayPal links for USD whole and fractional minor units", () => {
    expect(
      payLinks(allHandles, {
        amount: MinorUnits.make(4500),
        currency: usd,
        tripName: "Vegas",
      }),
    ).toEqual([
      {
        app: "venmo",
        label: "Venmo",
        url: "https://venmo.com/bea-smith?txn=pay&amount=45&note=Vegas%20%C2%B7%20Stacks",
      },
      {
        app: "cashApp",
        label: "Cash App",
        url: "https://cash.app/$beaCash/45",
      },
      {
        app: "paypal",
        label: "PayPal",
        url: "https://paypal.me/beaPay/45USD",
      },
    ]);

    expect(
      payLinks(allHandles, {
        amount: MinorUnits.make(4550),
        currency: usd,
        tripName: "Reno & Tahoe",
      }),
    ).toEqual([
      {
        app: "venmo",
        label: "Venmo",
        url: "https://venmo.com/bea-smith?txn=pay&amount=45.50&note=Reno%20%26%20Tahoe%20%C2%B7%20Stacks",
      },
      {
        app: "cashApp",
        label: "Cash App",
        url: "https://cash.app/$beaCash/45.50",
      },
      {
        app: "paypal",
        label: "PayPal",
        url: "https://paypal.me/beaPay/45.50USD",
      },
    ]);

    expect(
      payLinks(
        { venmo: "bea", cashApp: null, paypal: null },
        { amount: MinorUnits.make(5), currency: usd, tripName: "Home" },
      ),
    ).toEqual([
      {
        app: "venmo",
        label: "Venmo",
        url: "https://venmo.com/bea?txn=pay&amount=0.05&note=Home%20%C2%B7%20Stacks",
      },
    ]);
  });

  it("hides USD-only apps for non-USD groups and formats zero-decimal currencies cleanly", () => {
    expect(
      payLinks(allHandles, {
        amount: MinorUnits.make(12025),
        currency: cad,
        tripName: "Montreal",
      }),
    ).toEqual([
      {
        app: "paypal",
        label: "PayPal",
        url: "https://paypal.me/beaPay/120.25CAD",
      },
    ]);

    expect(
      payLinks(allHandles, {
        amount: MinorUnits.make(5000),
        currency: jpy,
        tripName: "Tokyo",
      }),
    ).toEqual([
      {
        app: "paypal",
        label: "PayPal",
        url: "https://paypal.me/beaPay/5000JPY",
      },
    ]);

    expect(
      payLinks(allHandles, {
        amount: MinorUnits.make(1500),
        currency: kwd,
        tripName: "Kuwait",
      }),
    ).toEqual([]);
  });

  it("returns no links when amount is zero or handles are empty", () => {
    expect(
      payLinks(allHandles, { amount: MinorUnits.make(0), currency: usd, tripName: "Vegas" }),
    ).toEqual([]);
    expect(
      payLinks(
        { venmo: null, cashApp: null, paypal: null },
        { amount: MinorUnits.make(4500), currency: usd, tripName: "Vegas" },
      ),
    ).toEqual([]);
  });
});

describe("formatSettleUpShare", () => {
  const alex = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");
  const bea = PlayerId.make("0192e7a0-0000-7000-8000-000000000002");
  const cal = PlayerId.make("0192e7a0-0000-7000-8000-000000000003");
  const names = new Map([
    [alex, "Alex"],
    [bea, "Bea"],
    [cal, "Cal"],
  ]);

  it("formats plain-text suggested payment lines with the trip name", () => {
    expect(
      formatSettleUpShare({
        tripName: "Vegas",
        transfers: [
          { from: alex, to: bea, amount: MinorUnits.make(4500) },
          { from: cal, to: bea, amount: MinorUnits.make(1250) },
        ],
        names,
        currency: usd,
        locale: "en-US",
      }),
    ).toBe("Vegas · Settle up\nAlex pays Bea $45\nCal pays Bea $12.50");
  });

  it("handles settled trips with no transfers", () => {
    expect(
      formatSettleUpShare({
        tripName: "Vegas",
        transfers: [],
        names,
        currency: usd,
        locale: "en-US",
      }),
    ).toBe("Vegas · Everyone's square");
  });
});

describe("paymentHandlesList and parsePaymentHandlesForm", () => {
  it("lists configured handles with display prefixes", () => {
    expect(paymentHandlesList(allHandles)).toEqual([
      { app: "venmo", label: "Venmo", value: "@bea-smith" },
      { app: "cashApp", label: "Cash App", value: "$beaCash" },
      { app: "paypal", label: "PayPal", value: "paypal.me/beaPay" },
    ]);
  });

  it("normalizes prefixes, treats blank fields as null, and surfaces field errors", () => {
    expect(
      parsePaymentHandlesForm({
        venmo: " @alex_1 ",
        cashApp: "",
        paypal: "paypal.me/alex",
      }),
    ).toEqual({
      ok: true,
      value: { venmo: "alex_1", cashApp: null, paypal: "alex" },
    });

    const bad = parsePaymentHandlesForm({
      venmo: "alex smith",
      cashApp: "$",
      paypal: "alex",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.venmo).toBeDefined();
      expect(bad.errors.cashApp).toBeDefined();
      expect(bad.errors.paypal).toBeUndefined();
    }
  });
});
