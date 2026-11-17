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
