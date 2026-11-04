import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const web = read("../index.css");
const mobile = read("../../../mobile/global.css");

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

const webDark = colors(web.slice(0, web.indexOf(":root[data-theme")));
const themes = {
  dark: webDark,
  light: { ...webDark, ...colors(block(web, ':root[data-theme="light"]')) },
};

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

const luminance = (color: string) => {
  const [r, g, b] = linearRgb(color).map((v) => Math.min(1, Math.max(0, v))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The ground a `bg-color/15` pill paints: alpha composites in gamma sRGB, not in OKLCH. */
const tinted = (color: string, ground: string, alpha: number) => {
  const encode = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = linearRgb(color).map(encode) as [number, number, number];
  const [x, y, z] = linearRgb(ground).map(encode) as [number, number, number];
  const mix = (over: number, under: number) => decode(alpha * over + (1 - alpha) * under);
  return 0.2126 * mix(r, x) + 0.7152 * mix(g, y) + 0.0722 * mix(b, z);
};

const hex = (color: string) =>
  `#${linearRgb(color)
    .map((v) => {
      const c = Math.min(1, Math.max(0, v));
      const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(255 * encoded)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;

const ratio = (one: number, other: number) =>
  (Math.max(one, other) + 0.05) / (Math.min(one, other) + 0.05);

const contrast = (one: string, other: string) => {
  const [hi, lo] = [luminance(one), luminance(other)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// The page behind the app, the scrollbar gutter and the phone's status bar are painted before the
// stylesheet loads, in hex; they must be the canvas, or a strip of another dark shows at the edges.
it.each(["../../index.html", "../../preview/index.html", "../lib/theme.ts"])(
  "%s paints the browser chrome in the canvas color",
  (path) => {
    const painted = new Set(
      read(path)
        .match(/#[0-9a-f]{6}\b/gi)!
        .map((c) => c.toLowerCase()),
    );
    expect(painted).toEqual(
      new Set([hex(themes.dark["--color-canvas"]!), hex(themes.light["--color-canvas"]!)]),
    );
  },
);

describe("the shared palette", () => {
  it("is the same on web and mobile", () => {
    expect(colors(block(mobile, "@variant dark"))).toEqual(themes.dark);
    expect(colors(block(mobile, "@variant light"))).toEqual(themes.light);
  });

  it("names the same type roles on web and mobile", () => {
    const roles = (css: string) => [...css.matchAll(/@utility (type-[a-z]+)/g)].map((m) => m[1]);
    expect(roles(mobile)).toEqual(expect.arrayContaining(roles(web)));
  });

  describe.each(Object.entries(themes))("%s", (_, theme) => {
    const text = ["ink", "muted", "accent-text", "win", "loss", "live", "danger"];
    const grounds = ["canvas", "surface", "sunken", "fill"];

    it.each(text.flatMap((fg) => grounds.map((bg) => [fg, bg] as const)))(
      "%s on %s passes AA",
      (fg, bg) => {
        const ratio = contrast(theme[`--color-${fg}`]!, theme[`--color-${bg}`]!);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      },
    );

    it("accent-ink passes AA on accent", () => {
      expect(
        contrast(theme["--color-accent-ink"]!, theme["--color-accent"]!),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it.each([
      ["live", "live", "canvas"],
      ["live", "live", "surface"],
      ["accent-text", "accent", "canvas"],
      ["accent-text", "accent", "surface"],
    ])("%s passes AA on a %s tint over %s", (fg, tint, ground) => {
      const paint = tinted(theme[`--color-${tint}`]!, theme[`--color-${ground}`]!, 0.15);
      expect(ratio(luminance(theme[`--color-${fg}`]!), paint)).toBeGreaterThanOrEqual(4.5);
    });

    it("stays inside sRGB, so no screen clips a color differently", () => {
      const outside = Object.entries(theme)
        .filter(([, color]) => linearRgb(color).some((v) => v < -0.001 || v > 1.001))
        .map(([name]) => name);
      expect(outside).toEqual([]);
    });
  });
});
