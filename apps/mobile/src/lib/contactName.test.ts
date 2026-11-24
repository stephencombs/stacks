import { expect, it } from "vite-plus/test";

import { contactName } from "./contactName";

it("trims the name", () => {
  expect(contactName("  Ada Lovelace \n")).toBe("Ada Lovelace");
});

it("keeps a name that fits", () => {
  const name = "a".repeat(60);

  expect(contactName(name)).toBe(name);
});

it("cuts a long name to 60 characters", () => {
  expect(contactName("a".repeat(75))).toBe("a".repeat(60));
});

it("trims again when the cut lands on whitespace", () => {
  expect(contactName(`${"a".repeat(59)} bcd`)).toBe("a".repeat(59));
  expect(contactName(`${"a".repeat(58)}   bcd`)).toBe("a".repeat(58));
});

it("doesn't leave half an emoji at the cut", () => {
  expect(contactName(`${"a".repeat(59)}😀`)).toBe("a".repeat(59));
  expect(contactName(`${"a".repeat(58)}😀`)).toBe(`${"a".repeat(58)}😀`);
});

it("fills nothing for an empty name", () => {
  expect(contactName("")).toBeNull();
  expect(contactName(" \t\n ")).toBeNull();
});
