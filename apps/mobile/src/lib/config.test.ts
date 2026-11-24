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

const buildFor = async (variant: string, host: string | undefined) => {
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("EXPO_PUBLIC_LINK_HOST", host ?? "");
  const { default: appConfig } = await import("../../app.config");
  const built = appConfig();
  Constants.expoConfig = {
    name: built.name,
    slug: built.slug,
    scheme: built.scheme,
    extra: built.extra,
  };

  return { built, config: await import("./config") };
};

const PATHS = ["/t", "/invite", "/join", "/claim"];

it.each([
  ["preview", "preview.colorup.test", "stacks-preview"],
  ["production", "colorup.test", "stacks"],
])("sends https links with the token in the fragment on %s", async (variant, host, scheme) => {
  const { config } = await buildFor(variant, host);

  expect(config.inviteUrl("t", "tok1")).toBe(`https://${host}/t#tok1`);
  expect(config.inviteUrl("invite", "tok2")).toBe(`https://${host}/invite#tok2`);
  expect(config.inviteUrl("join", "code3")).toBe(`https://${host}/join#code3`);
  expect(config.inviteUrl("claim", "code4")).toBe(`https://${host}/claim#code4`);
  expect(config.appLinkPrefixes()).toContain(`https://${host}`);
  expect(config.appLinkPrefixes()).toContain(`${scheme}://`);
  expect(config.appUrl("t/tok1")).toBe(`${scheme}://t/tok1`);
});

it.each(["preview", "production"])(
  "falls back to the scheme on %s with no host set",
  async (variant) => {
    const { config, built } = await buildFor(variant, undefined);
    const scheme = variant === "preview" ? "stacks-preview" : "stacks";

    expect(config.inviteUrl("t", "tok1")).toBe(`${scheme}://t/tok1`);
    expect(config.inviteUrl("claim", "code4")).toBe(`${scheme}://claim/code4`);
    expect(config.appLinkPrefixes().some((prefix) => prefix.startsWith("https:"))).toBe(false);
    expect(built.ios).not.toHaveProperty("associatedDomains");
    expect(built.android).not.toHaveProperty("intentFilters");
  },
);

it("never verifies links for a dev build, whatever the host", async () => {
  const { config, built } = await buildFor("development", "preview.colorup.test");

  expect(config.inviteUrl("invite", "tok2")).toBe("stacks-dev://invite/tok2");
  expect(built.ios).not.toHaveProperty("associatedDomains");
  expect(built.android).not.toHaveProperty("intentFilters");
});

it("associates the app with its own host, and only the four link paths", async () => {
  const { built } = await buildFor("preview", "preview.colorup.test");

  expect(built.ios.associatedDomains).toEqual(["applinks:preview.colorup.test"]);
  expect(built.android.intentFilters).toEqual([
    {
      autoVerify: true,
      action: "VIEW",
      data: PATHS.map((path) => ({ scheme: "https", host: "preview.colorup.test", path })),
      category: ["BROWSABLE", "DEFAULT"],
    },
  ]);
});
