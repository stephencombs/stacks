import type { ExpoConfig } from "expo/config";

type AppVariant = "development" | "preview" | "production";

const VARIANTS: Record<AppVariant, { name: string; scheme: string; id: string }> = {
  development: { name: "Stacks Dev", scheme: "stacks-dev", id: "com.stephencombs.stacks.dev" },
  preview: {
    name: "Stacks Preview",
    scheme: "stacks-preview",
    id: "com.stephencombs.stacks.preview",
  },
  production: { name: "Stacks", scheme: "stacks", id: "com.stephencombs.stacks" },
};

const variant = (process.env.APP_VARIANT ?? "development") as AppVariant;
const { name, scheme, id } = VARIANTS[variant] ?? VARIANTS.development;

export default (): ExpoConfig => ({
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
    // Only HTTPS and Apple's own crypto, which is exempt; saves the export-compliance prompt on every upload.
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: id,
    // Google's map on Android needs a key in the build; without one the route shows as a list.
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
  },
  plugins: [
    "@clerk/expo",
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Stacks uses your location to list the casinos near you first.",
      },
    ],
  ],
  web: { bundler: "metro", output: "single" },
  extra: { appVariant: variant, eas: { projectId: "e15fb4de-bc0f-49f9-b03d-ed701d1c895c" } },
});
