import {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
  type ConfigPlugin,
} from "expo/config-plugins";

/**
 * Android paints switches, text handles, selections and dialog buttons from the app theme's
 * accent, which stock Android sets to its own teal. Color Up's tokens replace it: the accent is
 * the ink (`--color-ink`, light and dark), and a selection is that ink at 20%.
 */
export const androidThemeColors = {
  light: { colorAccent: "#111114", selectionHighlight: "#33111114" },
  night: { colorAccent: "#f5f5f7", selectionHighlight: "#33f5f5f7" },
} as const;

export const androidThemeItems = {
  colorAccent: "@color/colorAccent",
  colorPrimary: "@color/colorAccent",
  colorControlActivated: "@color/colorAccent",
  "android:textColorHighlight": "@color/selectionHighlight",
} as const;

export function assignColors(
  xml: Parameters<typeof AndroidConfig.Colors.assignColorValue>[0],
  colors: Record<string, string>,
) {
  return Object.entries(colors).reduce(
    (result, [name, value]) => AndroidConfig.Colors.assignColorValue(result, { name, value }),
    xml,
  );
}

export function assignThemeItems(
  xml: Parameters<typeof AndroidConfig.Styles.assignStylesValue>[0],
) {
  return Object.entries(androidThemeItems).reduce(
    (result, [name, value]) =>
      AndroidConfig.Styles.assignStylesValue(result, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name,
        value,
      }),
    xml,
  );
}

const withAndroidTheme: ConfigPlugin = (config) => {
  config = withAndroidColors(config, (config) => {
    config.modResults = assignColors(config.modResults, androidThemeColors.light);

    return config;
  });
  config = withAndroidColorsNight(config, (config) => {
    config.modResults = assignColors(config.modResults, androidThemeColors.night);

    return config;
  });

  return withAndroidStyles(config, (config) => {
    config.modResults = assignThemeItems(config.modResults);

    return config;
  });
};

export default withAndroidTheme;
