import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  CashAppHandleInput,
  PayPalHandleInput,
  VenmoHandleInput,
  type CurrencyCode,
  type MinorUnits,
  type PaymentHandles,
  type PlayerId,
  type Transfer,
} from "@stacks/contracts";
import { formatMoney, minorUnitDigits } from "@stacks/shared/money";

export type PaymentApp = "venmo" | "cashApp" | "paypal";

export interface PayLink {
  readonly app: PaymentApp;
  readonly label: string;
  readonly url: string;
}

const PAYPAL_CURRENCIES: ReadonlySet<string> = new Set([
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "ILS",
  "JPY",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "SEK",
  "SGD",
  "THB",
  "TWD",
  "USD",
]);

const formatUrlAmount = (amount: MinorUnits, currency: CurrencyCode): string => {
  const digits = minorUnitDigits(currency);
  const padded = String(Math.abs(amount)).padStart(digits + 1, "0");
  if (digits === 0) return padded;
  const whole = padded.slice(0, -digits);
  const fraction = padded.slice(-digits);
  return /^0+$/.test(fraction) ? whole : `${whole}.${fraction}`;
};

export const payLinks = (
  handles: PaymentHandles,
  options: {
    readonly amount: MinorUnits;
    readonly currency: CurrencyCode;
    readonly tripName: string;
  },
): ReadonlyArray<PayLink> => {
  if (options.amount <= 0) return [];
  const amount = formatUrlAmount(options.amount, options.currency);
  const note = `${options.tripName} · Stacks`;
  const links: Array<PayLink> = [];

  // Venmo and Cash App only operate in USD.
  if (handles.venmo && options.currency === "USD") {
    links.push({
      app: "venmo",
      label: "Venmo",
      url: `https://venmo.com/${encodeURIComponent(handles.venmo)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`,
    });
  }

  // Cash App $cashtag URLs prefill recipient and USD amount; query parameters for notes are ignored.
  if (handles.cashApp && options.currency === "USD") {
    links.push({
      app: "cashApp",
      label: "Cash App",
      url: `https://cash.app/$${encodeURIComponent(handles.cashApp)}/${amount}`,
    });
  }

  // PayPal.Me URLs prefill amount and ISO-4217 currency in the path; note query params aren't supported.
  if (handles.paypal && PAYPAL_CURRENCIES.has(options.currency)) {
    links.push({
      app: "paypal",
      label: "PayPal",
      url: `https://paypal.me/${encodeURIComponent(handles.paypal)}/${amount}${options.currency}`,
    });
  }

  return links;
};

export const formatSettleUpShare = (options: {
  readonly tripName: string;
  readonly transfers: ReadonlyArray<Transfer>;
  readonly names: ReadonlyMap<PlayerId, string>;
  readonly currency: CurrencyCode;
  readonly locale?: string;
}): string => {
  if (options.transfers.length === 0) return `${options.tripName} · Everyone's square`;
  const lines = options.transfers.map((transfer) => {
    const from = options.names.get(transfer.from) ?? "Someone";
    const to = options.names.get(transfer.to) ?? "Someone";
    const amount = formatMoney(
      transfer.amount,
      options.currency,
      options.locale ? { locale: options.locale } : undefined,
    );
    return `${from} pays ${to} ${amount}`;
  });
  return `${options.tripName} · Settle up\n${lines.join("\n")}`;
};

export const paymentHandlesList = (
  handles: PaymentHandles,
): ReadonlyArray<{ readonly app: PaymentApp; readonly label: string; readonly value: string }> => {
  const items: Array<{ readonly app: PaymentApp; readonly label: string; readonly value: string }> =
    [];
  if (handles.venmo) items.push({ app: "venmo", label: "Venmo", value: `@${handles.venmo}` });
  if (handles.cashApp)
    items.push({ app: "cashApp", label: "Cash App", value: `$${handles.cashApp}` });
  if (handles.paypal)
    items.push({ app: "paypal", label: "PayPal", value: `paypal.me/${handles.paypal}` });
  return items;
};

const decodeVenmo = Schema.decodeUnknownOption(VenmoHandleInput);
const decodeCashApp = Schema.decodeUnknownOption(CashAppHandleInput);
const decodePayPal = Schema.decodeUnknownOption(PayPalHandleInput);

export type PaymentHandlesDraft = {
  readonly venmo: string;
  readonly cashApp: string;
  readonly paypal: string;
};

export type PaymentHandlesErrors = {
  readonly venmo?: string;
  readonly cashApp?: string;
  readonly paypal?: string;
};

export const parsePaymentHandlesForm = (
  draft: PaymentHandlesDraft,
):
  | {
      readonly ok: true;
      readonly value: { venmo: string | null; cashApp: string | null; paypal: string | null };
    }
  | { readonly ok: false; readonly errors: PaymentHandlesErrors } => {
  const venmoRaw = draft.venmo.trim();
  const cashAppRaw = draft.cashApp.trim();
  const paypalRaw = draft.paypal.trim();

  const venmo = venmoRaw === "" ? Option.some(null) : decodeVenmo(venmoRaw);
  const cashApp = cashAppRaw === "" ? Option.some(null) : decodeCashApp(cashAppRaw);
  const paypal = paypalRaw === "" ? Option.some(null) : decodePayPal(paypalRaw);

  const errors: { venmo?: string; cashApp?: string; paypal?: string } = {};
  if (Option.isNone(venmo)) {
    errors.venmo = "Use letters, numbers, - or _, up to 30 characters.";
  }
  if (Option.isNone(cashApp)) {
    errors.cashApp = "Use letters, numbers, - or _, up to 20 characters.";
  }
  if (Option.isNone(paypal)) {
    errors.paypal = "Use letters, numbers, - or _, up to 30 characters.";
  }

  if (errors.venmo || errors.cashApp || errors.paypal) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      venmo: Option.getOrNull(venmo),
      cashApp: Option.getOrNull(cashApp),
      paypal: Option.getOrNull(paypal),
    },
  };
};
