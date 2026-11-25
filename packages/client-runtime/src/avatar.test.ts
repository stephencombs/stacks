import { expect, it } from "@effect/vitest";

import { AVATAR_TONES, avatarToneOf, initialsOf } from "./avatar.ts";

it("takes the first letters of the first and last name", () => {
  expect(initialsOf("Ada Lovelace")).toBe("AL");
  expect(initialsOf("ada lovelace")).toBe("AL");
  expect(initialsOf("Mary Jane Watson")).toBe("MW");
  expect(initialsOf("Ludwig van Beethoven", 1)).toBe("L");
});

it("gives a single name one letter", () => {
  expect(initialsOf("Ada")).toBe("A");
  expect(initialsOf("Ada", 1)).toBe("A");
});

it("reads the word You like any other name", () => {
  expect(initialsOf("You")).toBe("Y");
});

it("ignores whitespace around and between names", () => {
  expect(initialsOf("  Ada \t  Lovelace\n")).toBe("AL");
  expect(initialsOf("   ")).toBe("");
  expect(initialsOf("")).toBe("");
});

it("skips emoji, quotes and punctuation, so only a letter or number can lead", () => {
  expect(initialsOf("🎰 Dave")).toBe("D");
  expect(initialsOf("Dave 🎰")).toBe("D");
  expect(initialsOf("💰Bob Smith")).toBe("BS");
  expect(initialsOf("(Dad)")).toBe("D");
  expect(initialsOf("“Big” Mike")).toBe("BM");
  expect(initialsOf("O'Brien")).toBe("O");
  expect(initialsOf("🎰🎲")).toBe("");
  expect(initialsOf("👨‍👩‍👧 Smith")).toBe("S");
});

it("keeps a leading number, as Contacts does", () => {
  expect(initialsOf("7 Eleven")).toBe("7E");
});

it("handles names outside the Latin alphabet", () => {
  expect(initialsOf("山田 太郎")).toBe("山太");
  expect(initialsOf("山田太郎")).toBe("山");
  expect(initialsOf("Ωmega")).toBe("Ω");
  expect(initialsOf("иван петров")).toBe("ИП");
  expect(initialsOf("محمد علي")).toBe("مع");
  expect(initialsOf("étienne")).toBe("É");
});

it("keeps a letter's combining accent with it", () => {
  expect(initialsOf("émile")).toBe("É");
});

it("gives a letter tile the same tone for the same player, always in range", () => {
  const ids = Array.from(
    { length: 64 },
    (_, n) => `0192e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`,
  );

  const tones = ids.map(avatarToneOf);

  expect(tones).toEqual(ids.map(avatarToneOf));
  expect(tones.every((tone) => Number.isInteger(tone) && tone >= 1 && tone <= AVATAR_TONES)).toBe(
    true,
  );
  expect(new Set(tones).size).toBe(AVATAR_TONES);
});
