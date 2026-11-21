import { expect, it } from "vite-plus/test";

import {
  ALL_STEPS,
  assertNoPhantomChevron,
  assertNoSubMinuteHourly,
  buildStartArgs,
  findInteractiveRef,
  parseCliArgs,
  resolveAppConfig,
} from "./verify-ios-ui-audit.mjs";

const BUILD_ID = "c2f88856-5752-45fa-903f-724273ee5c4e";

it("parses valid CLI arguments, step filters, and rejects invalid input", () => {
  const parsed = parseCliArgs([
    BUILD_ID,
    "--preflight",
    "--metro-url",
    "https://demo.on.expo.app",
    "--only",
    "empty-tabs-and-map-you, invalid-table-deeplink",
    "--device",
    "iPhone 17",
    "--max-minutes",
    "12",
  ]);

  expect(parsed.buildId).toBe(BUILD_ID);
  expect(parsed.preflight).toBe(true);
  expect(parsed.metroUrl).toBe("https://demo.on.expo.app");
  expect([...parsed.only!]).toEqual(["empty-tabs-and-map-you", "invalid-table-deeplink"]);
  expect(parsed.deviceName).toBe("iPhone 17");
  expect(parsed.maxMinutes).toBe(12);

  expect(() => parseCliArgs(["not-a-uuid"])).toThrow(/verify:ios-ui-audit/);
  expect(() => parseCliArgs([BUILD_ID, "--only", "unknown-step"])).toThrow(
    /Unknown verification step/,
  );
  expect(() => parseCliArgs([BUILD_ID, "--max-minutes", "200"])).toThrow(/1 and 115/);
  expect(ALL_STEPS).toHaveLength(6);
});

it("resolves bundle identifiers to their URL schemes", () => {
  expect(resolveAppConfig("com.stephencombs.colorup.dev")).toEqual({
    appId: "com.stephencombs.colorup.dev",
    scheme: "stacks-dev",
  });
  expect(resolveAppConfig("com.stephencombs.colorup.preview")).toEqual({
    appId: "com.stephencombs.colorup.preview",
    scheme: "stacks-preview",
  });
  expect(resolveAppConfig("com.stephencombs.colorup")).toEqual({
    appId: "com.stephencombs.colorup",
    scheme: "stacks",
  });
  expect(() => resolveAppConfig("com.example.other")).toThrow(/Unsupported iOS bundle/);
});

it("builds simulator:start flags with dev-menu launch args when metroUrl is provided", () => {
  const plain = buildStartArgs(BUILD_ID, "stacks-preview", "Audit run");
  expect(plain).not.toContain("--open-url");
  expect(plain).toContain("--build-id");

  const withMetro = buildStartArgs(
    BUILD_ID,
    "stacks-dev",
    "Live dev check",
    "iPhone 17 Pro",
    15,
    3,
    "https://demo.on.expo.app",
  );

  expect(withMetro).toContain("--launch-arg");
  expect(withMetro).toContain("-EXDevMenuIsOnboardingFinished");
  expect(withMetro).toContain("--open-url");
  expect(withMetro.at(-1)).toBe(
    "stacks-dev://expo-development-client/?url=https%3A%2F%2Fdemo.on.expo.app",
  );
});

it("locates interactive refs and enforces HeaderTitle and sub-minute hourly assertions", () => {
  const sampleTree = [
    '  @e1 [button] "Back" Back',
    '  @e2 [button] "Buy-in total, $300" Buy-in total',
    '  @e3 [tab] "Stats" Stats',
  ].join("\n");

  expect(findInteractiveRef(sampleTree, "Back", /\[button\]/i)).toBe("@e1");
  expect(findInteractiveRef(sampleTree, /^Buy-in total/i, /\[button\]/i)).toBe("@e2");
  expect(findInteractiveRef(sampleTree, "Stats", /\[tab\]/i)).toBe("@e3");
  expect(findInteractiveRef(sampleTree, "Missing")).toBeNull();

  expect(() => assertNoPhantomChevron(sampleTree, "Stats")).not.toThrow();
  expect(() =>
    assertNoPhantomChevron('  @e9 [button] "All sessions Show screen details"', "All sessions"),
  ).toThrow(/phantom HeaderTitle/);

  expect(() => assertNoSubMinuteHourly("+$150\n$200 in\n$350 out")).not.toThrow();
  expect(() => assertNoSubMinuteHourly("+$150\n+$12,857.14/hr")).toThrow(/sub-minute/);
});
