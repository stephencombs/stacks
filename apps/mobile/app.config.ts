type AppVariant = "development" | "preview" | "production";

const VARIANTS: Record<AppVariant, { name: string; scheme: string; id: string }> = {
  development: { name: "Color Up Dev", scheme: "stacks-dev", id: "com.stephencombs.colorup.dev" },
  preview: {
    name: "Color Up Preview",
    scheme: "stacks-preview",
    id: "com.stephencombs.colorup.preview",
  },
  production: { name: "Color Up", scheme: "stacks", id: "com.stephencombs.colorup" },
};

const requested = process.env.APP_VARIANT;

const variant: AppVariant =
  requested === "preview" || requested === "production" ? requested : "development";

const { name, scheme, id } = VARIANTS[variant];

export default () => ({
  name,
  slug: "stacks",
  scheme,
  version: "1.0.0",
  icon: "./assets/icon.png",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: id,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: id,
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
  },
  plugins: [
    "@clerk/expo",
    "expo-secure-store",
    "expo-web-browser",
    "expo-maps",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Color Up uses your location to list the casinos near you first.",
      },
    ],
    "expo-widgets",
    "./plugins/withIosFormSheet",
    "./plugins/withStartupCrashRecovery",
    "./plugins/withAndroidTabIcons",
    "./plugins/withAndroidTheme",
    "./plugins/withAndroidLiveUpdates",
  ],
  extra: {
    appVariant: variant,
    googleMapsEnabled: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    eas: { projectId: "e15fb4de-bc0f-49f9-b03d-ed701d1c895c" },
  },
});
