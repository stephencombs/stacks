import { readFileSync } from "node:fs";
import { AndroidConfig } from "expo/config-plugins";
import { expect, it } from "vite-plus/test";
import { androidThemeColors, assignColors, assignThemeItems } from "./withAndroidTheme";

const styles = {
  resources: {
    style: [
      {
        $: { name: "AppTheme", parent: "Theme.AppCompat.DayNight.NoActionBar" },
        item: [{ $: { name: "android:windowBackground" }, _: "@color/activityBackground" }],
      },
    ],
  },
};

it("themes the app's accent, and a selection, in both light and dark", () => {
  const light = assignColors({ resources: {} }, androidThemeColors.light);
  const night = assignColors({ resources: {} }, androidThemeColors.night);
  expect(AndroidConfig.Colors.getColorsAsObject(light)).toEqual(androidThemeColors.light);
  expect(AndroidConfig.Colors.getColorsAsObject(night)).toEqual(androidThemeColors.night);
});

it("points the theme at those colors and keeps its other items", () => {
  const result = assignThemeItems(styles);
  expect(AndroidConfig.Styles.getStylesGroupAsObject(result, { name: "AppTheme" })).toEqual({
    "android:windowBackground": "@color/activityBackground",
    colorAccent: "@color/colorAccent",
    colorPrimary: "@color/colorAccent",
    colorControlActivated: "@color/colorAccent",
    "android:textColorHighlight": "@color/selectionHighlight",
  });
});

const css = readFileSync(new URL("../global.css", import.meta.url), "utf8");

function inkToken(scheme: "light" | "dark") {
  const block = css.split(`@variant ${scheme} {`)[1]!;
  const [, lightness, chroma, hue] = /--color-ink:\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(
    block,
  )!;
  const [l, c, h] = [Number(lightness), Number(chroma), (Number(hue) * Math.PI) / 180];
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((x) => x ** 3);
  const linear = [
    4.0767416621 * lms[0]! - 3.3077115913 * lms[1]! + 0.2309699292 * lms[2]!,
    -1.2684380046 * lms[0]! + 2.6097574011 * lms[1]! - 0.3413193965 * lms[2]!,
    -0.0041960863 * lms[0]! - 0.7034186147 * lms[1]! + 1.707614701 * lms[2]!,
  ];
  return linear.map((x) => {
    const clamped = Math.min(1, Math.max(0, x));
    return Math.round(
      255 * (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055),
    );
  });
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

it("keeps the theme's accent equal to --color-ink in global.css, light and dark", () => {
  for (const [scheme, colors] of [
    ["light", androidThemeColors.light],
    ["dark", androidThemeColors.night],
  ] as const) {
    const token = inkToken(scheme);
    const accent = channels(colors.colorAccent);
    token.forEach((value, i) => expect(Math.abs(value - accent[i]!)).toBeLessThanOrEqual(1));
    expect(colors.selectionHighlight).toBe(`#33${colors.colorAccent.slice(1)}`);
  }
});
