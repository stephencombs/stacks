import { expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));

const { screenFoot } = await import("./tabBar");

const base = { bar: 80, inset: 24, footer: null, fab: false, live: 0, footerGap: 0 } as const;

it("Android's list stops above the opaque tab bar, and the LiveBar and FAB float on it", () => {
  const foot = screenFoot({ ...base, platform: "android", live: 52, fab: true });
  expect(foot.scrollStyle).toEqual({ marginBottom: 80 });
  expect(foot.endSpace).toBe(60 + 88);
  expect(foot.fabBottom).toBe(80 + 60 + 16);
  expect(foot.above).toBe(80);
  expect(foot.clearance).toBe(80);
});

it("iOS's list scrolls under the glass tab bar and pads its end instead", () => {
  const foot = screenFoot({ ...base, platform: "ios", live: 52, fab: true });
  expect(foot.scrollStyle).toBeUndefined();
  expect(foot.endSpace).toBe(80 + 52 + 88);
  expect(foot.fabBottom).toBe(80 + 60 + 16);
  expect(foot.clearance).toBe(80);
});

it("a footer holds the foot of the screen, and the FAB and LiveBar stack above it", () => {
  const input = { ...base, footer: 96, fab: true, live: 52 };
  const android = screenFoot({ ...input, platform: "android" });
  expect(android.scrollStyle).toBeUndefined();
  expect(android.endSpace).toBe(96 + 60 + 88);
  expect(android.fabBottom).toBe(96 + 60 + 16);
  expect(android.above).toBe(96);
  expect(screenFoot({ ...input, platform: "ios" }).endSpace).toBe(96 + 52 + 88);
});

it("a screen off the tabs clears the gesture inset by at least 12, plus the footer's own gap", () => {
  const off = { ...base, bar: 0 };
  expect(screenFoot({ ...off, platform: "android", inset: 0 }).footerInset).toBe(12);
  expect(screenFoot({ ...off, platform: "android", inset: 24, footerGap: 12 }).footerInset).toBe(
    36,
  );
  expect(screenFoot({ ...off, platform: "android" }).above).toBeUndefined();
  expect(screenFoot({ ...off, platform: "android" }).clearance).toBe(24);
  expect(screenFoot({ ...off, platform: "ios" }).clearance).toBe(24);
});

it("at the end of a list, nothing floating covers the last row", () => {
  const FAB = 56;

  for (const platform of ["android", "ios"]) {
    for (const footer of [null, 96]) {
      for (const live of [0, 52, 76]) {
        const foot = screenFoot({ ...base, platform, footer, fab: true, live });
        const listBottom = footer === null && platform === "android" ? base.bar : 0;
        const fabTop = foot.fabBottom + FAB - listBottom;
        const liveTop = (foot.above ?? 0) + 8 + live - listBottom;
        expect(foot.endSpace, `${platform} footer ${footer} live ${live}`).toBeGreaterThanOrEqual(
          Math.max(fabTop, live > 0 ? liveTop : 0),
        );
      }
    }
  }
});
