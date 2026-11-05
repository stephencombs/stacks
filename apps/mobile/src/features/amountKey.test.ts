import { CurrencyCode } from "@stacks/contracts";
import { decimalSeparator } from "@stacks/shared/money";
import { expect, it } from "vite-plus/test";

import { applyAmountKey, readCashOut } from "./amountKey";

const USD = CurrencyCode.make("USD");
const JPY = CurrencyCode.make("JPY");
const decimal = decimalSeparator();

const type = (keys: ReadonlyArray<string>, start = "") =>
  keys.reduce((amount, key) => applyAmountKey(amount, key, decimal), start);

it("appends digits and replaces a lone zero", () => {
  expect(type(["1", "2"])).toBe("12");
  expect(type(["5"], "0")).toBe("5");
  expect(type(["0"], "0")).toBe("0");
});

it("allows one decimal mark and keeps it after zero", () => {
  expect(type(["0", decimal, "5"])).toBe(`0${decimal}5`);
  expect(type(["1", decimal, "2", decimal, "3"])).toBe(`1${decimal}23`);
});

it("deletes the last typed character", () => {
  expect(type(["back"], "12")).toBe("1");
  expect(type(["back"])).toBe("");
});

it("toggles a leading minus for adjustments", () => {
  expect(type(["sign"], "12")).toBe("-12");
  expect(type(["sign"], "-12")).toBe("12");
  expect(type(["sign"])).toBe("-");
});

it("reads a bust as zero and a cleared field as missing", () => {
  expect(readCashOut(type(["0"]), USD)).toBe(0);
  expect(readCashOut(type(["1", "back"]), USD)).toBe(null);
  expect(readCashOut(type(["1", "0", decimal, "5"]), USD)).toBe(1050);
});

it("rejects a negative cash-out and too many fraction digits", () => {
  expect(readCashOut(type(["sign", "5"]), USD)).toBe(null);
  expect(readCashOut(type(["1", decimal, "2", "3", "4"]), USD)).toBe(null);
  expect(readCashOut(type(["1", "5", "0", "0"]), JPY)).toBe(1500);
});
