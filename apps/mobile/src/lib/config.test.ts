import { afterEach, expect, it, vi } from "vite-plus/test";

vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
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

it.each(["test-map-key", ""])("publishes only map availability for key %s", async (key) => {
  vi.stubEnv("GOOGLE_MAPS_API_KEY", key);
  const { default: appConfig } = await import("../../app.config");
  const config = appConfig();
  expect(config.extra?.googleMapsEnabled).toBe(Boolean(key));
  expect(config.android?.config?.googleMaps?.apiKey).toBe(key);
  expect(JSON.stringify(config.extra)).not.toContain("test-map-key");
});
