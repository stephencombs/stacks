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
  version: "0.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: id, supportsTablet: true },
  android: { package: id },
  extra: { appVariant: variant },
});
