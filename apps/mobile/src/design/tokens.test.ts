import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../../global.css");
const tokens: {
  color: { tokens: ReadonlyArray<{ name: string; value: { light: string; dark: string } }> };
} = JSON.parse(read("../../../../docs/design/tokens.json"));

/** The `--color-*` declarations in a piece of CSS. */
const colors = (css: string) =>
  Object.fromEntries(
    [...css.matchAll(/(--color-[a-z0-9-]+):\s*(oklch\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]),
  );

/** The text from `start` to the brace that closes the block opening there. */
const block = (css: string, start: string) => {
  const open = css.indexOf("{", css.indexOf(start));
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open, i);
  }
  throw new Error(`No block at ${start}`);
};

const themes = {
  light: colors(block(css, "@variant light")),
  dark: colors(block(css, "@variant dark")),
};

// The code kept its Tailwind names where they mean the same as a token.
const cssName: Record<string, string> = {
  ground: "canvas",
  card: "surface",
  "card-raised": "raised",
  hairline: "line",
  "live-text": "live",
};
const variable = (token: string) => `--color-${cssName[token] ?? token}`;
// Player chips are a player's identity, numbered by the server, and aren't design tokens.
const playerChip = /^--color-chip-(\d(-ink)?|edge)$/;

const linearRgb = (color: string) => {
  const [l, c, h] = color.match(/[\d.]+/g)!.map(Number) as [number, number, number];
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const z = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
  ] as const;
};

const encode = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

/** An `oklch()` color as 8-bit sRGB channels and its alpha. */
const rgba = (color: string) => [
  ...linearRgb(color).map((v) => 255 * encode(v)),
  Number(color.match(/\/\s*([\d.]+)/)?.[1] ?? 1),
];

/** A tokens.json color, `#rrggbb` or `rgba(r, g, b, a)`, the same way. */
const parse = (color: string) =>
  color.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).concat(1)
    : color.match(/[\d.]+/g)!.map(Number);

const luminance = (color: string) => {
  const [r, g, b] = linearRgb(color).map((v) => Math.min(1, Math.max(0, v))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (one: number, other: number) =>
  (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);

const contrast = (one: string, other: string) => ratio(luminance(one), luminance(other));

describe.each(Object.entries(themes))("the %s palette", (name, theme) => {
  it("declares the same colors as the other theme", () => {
    const other = name === "light" ? themes.dark : themes.light;
    expect(Object.keys(theme).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(tokens.color.tokens.map((token) => [token.name, token.value] as const))(
    "%s matches docs/design/tokens.json",
    (token, value) => {
      const css = theme[variable(token)];
      expect(css, variable(token)).toBeDefined();
      const expected = parse(value[name as keyof typeof value]);
      // Within one step of 255 per channel, and the same alpha.
      const off = rgba(css!).map(
        (channel, i) => Math.abs(channel - expected[i]!) / (i < 3 ? 1 : 0.001),
      );
      expect(Math.max(...off)).toBeLessThanOrEqual(1);
    },
  );

  it("has no color outside the tokens but the player chips", () => {
    const known = new Set(tokens.color.tokens.map((token) => variable(token.name)));
    expect(Object.keys(theme).filter((v) => !known.has(v) && !playerChip.test(v))).toEqual([]);
  });

  it.each([
    ["ink", "canvas"],
    ["ink", "surface"],
    ["muted", "canvas"],
    ["muted", "surface"],
    ["win", "canvas"],
    ["win", "surface"],
    ["win", "fill"],
    ["loss", "canvas"],
    ["loss", "surface"],
    ["loss", "fill"],
    ["live", "canvas"],
    ["live", "surface"],
    ["ink-inverse", "ink"],
    ["felt-ink", "felt"],
  ])("%s on %s passes AA", (fg, bg) => {
    expect(contrast(theme[`--color-${fg}`]!, theme[`--color-${bg}`]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("stays inside sRGB, so no screen clips a color differently", () => {
    const outside = Object.entries(theme)
      .filter(([, color]) => linearRgb(color).some((v) => v < -0.001 || v > 1.001))
      .map(([name]) => name);
    expect(outside).toEqual([]);
  });
});
