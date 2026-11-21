import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../../global.css");

const tokens: {
  color: { tokens: ReadonlyArray<{ name: string; value: { light: string; dark: string } }> };
} = JSON.parse(read("../../../../docs/design/tokens.json"));

const colors = (css: string) =>
  Object.fromEntries(
    [...css.matchAll(/(--color-[a-z0-9-]+):\s*(oklch\([^)]*\))/g)].map((m) => [m[1]!, m[2]!]),
  );

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

const cssName = {
  ground: "canvas",
  card: "surface",
  "card-raised": "raised",
  hairline: "line",
  "live-text": "live",
} as const;

const variable = (token: string) => {
  switch (token) {
    case "ground":
    case "card":
    case "card-raised":
    case "hairline":
    case "live-text":
      return `--color-${cssName[token]}`;
    default:
      return `--color-${token}`;
  }
};

const playerChip = /^--color-chip-(\d(-ink)?|edge)$/;

const linearRgb = (color: string) => {
  const channels = color.match(/[\d.]+/g);

  if (channels === null || channels.length < 3)
    throw new Error(`expected an OKLCH color: ${color}`);
  const l = Number(channels[0]);
  const c = Number(channels[1]);
  const h = Number(channels[2]);
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

const rgba = (color: string) => [
  ...linearRgb(color).map((v) => 255 * encode(v)),
  Number(color.match(/\/\s*([\d.]+)/)?.[1] ?? 1),
];

const parse = (color: string) =>
  color.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)).concat(1)
    : color.match(/[\d.]+/g)!.map(Number);

const clampChannel = (channel: number) => Math.min(1, Math.max(0, channel));

const luminance = (color: string) => {
  const [x, y, z] = linearRgb(color);
  const r = clampChannel(x);
  const g = clampChannel(y);
  const b = clampChannel(z);

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
      const expected = parse(name === "dark" ? value.dark : value.light);

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

it("defines every type role the screens use", () => {
  const defined = new Set([...css.matchAll(/@utility (type-[a-z0-9-]+)/g)].map((m) => m[1]));
  const src = new URL("..", import.meta.url);

  const used = new Set(
    readdirSync(src, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .flatMap((file) => [...read(`../${file}`).matchAll(/(?<![\w-])type-[a-z][a-z0-9-]*/g)])
      .map((m) => m[0]),
  );

  expect(used.size).toBeGreaterThan(0);
  expect([...used].filter((role) => !defined.has(role))).toEqual([]);
});
