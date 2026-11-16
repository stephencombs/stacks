import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("expo-linking", () => ({ createURL: (path = "") => `stacks://${path}` }));
import Constants from "expo-constants";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([true, false])(
  "reads Android map availability from public config (%s)",
  async (enabled) => {
    Constants.expoConfig = {
      name: "Color Up",
      slug: "stacks",
      extra: { googleMapsEnabled: enabled },
    };
    const config = await import("./config");
    expect(config.googleMapsEnabled).toBe(enabled);
  },
);

it("keeps maps disabled for existing builds without the flag", async () => {
  Constants.expoConfig = { name: "Color Up", slug: "stacks" };
  const config = await import("./config");
  expect(config.googleMapsEnabled).toBe(false);
});

it("builds deep links from the build's scheme, not Metro's host", async () => {
  Constants.expoConfig = {
    name: "Color Up Dev",
    slug: "stacks",
    scheme: "stacks-dev",
    hostUri: "192.168.1.5:8081",
  };
  const { appUrl, appLinkPrefixes } = await import("./config");
  expect(appUrl("/t/abc")).toBe("stacks-dev://t/abc");
  expect(appUrl("invite/xyz")).toBe("stacks-dev://invite/xyz");
  expect(appLinkPrefixes()[0]).toBe("stacks-dev://");
});

it.each(["test-map-key", ""])("publishes only map availability for key %s", async (key) => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", key);
  const { default: appConfig } = await import("../../app.config");
  const config = appConfig();
  expect(config.extra?.googleMapsEnabled).toBe(Boolean(key));
  expect(config.android?.config?.googleMaps?.apiKey).toBe(key);
  expect(JSON.stringify(config.extra)).not.toContain("test-map-key");
});
