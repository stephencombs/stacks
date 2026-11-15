import { afterEach, expect, it, vi } from "vite-plus/test";

/** The motion module against a fake React Native, with Reduce Motion set as given. */
async function load(reduceMotion: boolean) {
  vi.resetModules();
  const timing = vi.fn(() => ({
    start: (done?: (result: { finished: boolean }) => void) => done?.({ finished: true }),
  }));
  vi.doMock("react-native", () => ({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(reduceMotion),
      addEventListener: () => ({ remove() {} }),
    },
    Animated: { timing },
    Easing: { bezier: () => (t: number) => t },
  }));
  const motion = await import("./motion");
  motion.isReducedMotion();
  await Promise.resolve();
  return { ...motion, timing };
}

const value = () => ({ setValue: vi.fn(), stopAnimation: vi.fn() });

afterEach(() => {
  vi.doUnmock("react-native");
});

it("jumps to the end with Reduce Motion on", async () => {
  const { animate, ease, timing } = await load(true);
  const shown = value();
  const done = vi.fn();
  animate(shown as never, { toValue: 1, duration: 250, easing: ease.enter }, done);
  expect(timing).not.toHaveBeenCalled();
  expect(shown.setValue).toHaveBeenCalledWith(1);
  expect(done).toHaveBeenCalledWith(true);
});

it("animates on the native driver otherwise", async () => {
  const { animate, ease, timing } = await load(false);
  const shown = value();
  const done = vi.fn();
  animate(shown as never, { toValue: 1, duration: 250, easing: ease.enter }, done);
  expect(timing).toHaveBeenCalledWith(
    shown,
    expect.objectContaining({ toValue: 1, duration: 250, useNativeDriver: true }),
  );
  expect(shown.setValue).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledWith(true);
});
