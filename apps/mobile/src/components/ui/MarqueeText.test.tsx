import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type Sized = { onLayout?: (event: { nativeEvent: { layout: { width: number } } }) => void };

type Scroller = { onContentSizeChange?: (width: number, height: number) => void };

type Delay = { kind: "delay"; ms: number };

type Timing = { kind: "timing"; toValue: number; duration: number; useNativeDriver: boolean };

type Step = Delay | Timing;

type Animatable = { setValue: () => void };

const setup = async (reduceMotion = false) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const calls: string[] = [];
  const timings: Timing[] = [];
  const loopStop = vi.fn();
  let viewport: Sized = {};
  let scroller: Scroller = {};

  vi.doMock("react-native", () => ({
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(reduceMotion),
      addEventListener: () => ({ remove() {} }),
    },
    Animated: {
      Value: class {
        setValue = vi.fn();
      },
      View: ({ children }: { children?: ReactNode }) => <div data-animated>{children}</div>,
      delay: (ms: number) => ({ kind: "delay", ms }) satisfies Delay,
      timing: (_value: Animatable, config: Omit<Timing, "kind">) => ({
        kind: "timing",
        ...config,
      }),
      sequence: (steps: Step[]) => ({ steps }),
      loop: (animation: { steps: Step[] }) => ({
        start: () => {
          calls.push("start");

          for (const step of animation.steps) {
            if (step.kind === "delay") calls.push(`delay ${step.ms}`);
            else timings.push(step);
          }
        },
        stop: () => {
          calls.push("stop");
          loopStop();
        },
      }),
    },
    Easing: { linear: (t: number) => t, bezier: () => (t: number) => t },
    ScrollView: ({ children, ...props }: Scroller & { children?: ReactNode }) => {
      scroller = props;

      return <div data-scroll>{children}</div>;
    },
    Text: ({
      children,
      ellipsizeMode,
      numberOfLines,
    }: {
      children?: ReactNode;
      ellipsizeMode?: string;
      numberOfLines?: number;
    }) => (
      <span data-lines={numberOfLines} data-ellipsize={ellipsizeMode}>
        {children}
      </span>
    ),
    View: ({ children, ...props }: Sized & { children?: ReactNode }) => {
      viewport = props;

      return <div>{children}</div>;
    },
  }));
  const motion = await import("./motion");
  motion.isReducedMotion();
  await Promise.resolve();
  const { MarqueeText, overflowOf } = await import("./MarqueeText");
  const element = document.createElement("div");
  const root = createRoot(element);

  const render = (text: string) =>
    act(async () => {
      root.render(<MarqueeText>{text}</MarqueeText>);
    });

  const measure = (box: number, text: number) =>
    act(async () => {
      viewport.onLayout?.({ nativeEvent: { layout: { width: box } } });
      scroller.onContentSizeChange?.(text, 20);
    });

  return { calls, timings, loopStop, element, render, measure, root, overflowOf };
};

it("measures how far text overflows its box", async () => {
  const { overflowOf } = await setup();
  expect(overflowOf(200, 120)).toBe(80);
  expect(overflowOf(120, 120)).toBe(0);
  expect(overflowOf(80, 120)).toBe(0);
  expect(overflowOf(80, 0)).toBe(0);
});

it("stays still when the text fits", async () => {
  const { render, measure, calls } = await setup();
  await render("Aria");
  await measure(160, 40);
  expect(calls).toEqual([]);
});

it("pauses, slides to the end, pauses and slides back when the text overflows", async () => {
  const { render, measure, calls, timings } = await setup();
  await render("The Palazzo at The Venetian");
  await measure(100, 270);
  expect(calls).toEqual(["start", "delay 2500", "delay 1500"]);
  expect(timings).toMatchObject([
    { toValue: -170, duration: 5000, useNativeDriver: true },
    { toValue: 0, duration: 5000, useNativeDriver: true },
  ]);
});

it("restarts when the box width changes and stops once the text fits", async () => {
  const { render, measure, calls, timings, loopStop } = await setup();
  await render("The Palazzo at The Venetian");
  await measure(100, 270);
  await measure(170, 270);
  expect(loopStop).toHaveBeenCalledTimes(1);
  expect(timings.at(-2)).toMatchObject({ toValue: -100 });
  await measure(300, 270);
  expect(loopStop).toHaveBeenCalledTimes(2);
  expect(calls.filter((call) => call === "start")).toHaveLength(2);
});

it("restarts when the text changes", async () => {
  const { render, measure, calls, loopStop } = await setup();
  await render("The Palazzo at The Venetian");
  await measure(100, 270);
  await render("Wynn Las Vegas, Encore Tower");
  await measure(100, 300);
  expect(loopStop).toHaveBeenCalledTimes(1);
  expect(calls.filter((call) => call === "start")).toHaveLength(2);
});

it("stops on unmount", async () => {
  const { render, measure, loopStop, root } = await setup();
  await render("The Palazzo at The Venetian");
  await measure(100, 270);
  await act(async () => root.unmount());
  expect(loopStop).toHaveBeenCalledTimes(1);
});

it("truncates instead of moving with Reduce Motion on", async () => {
  const { render, calls, element } = await setup(true);
  await render("The Palazzo at The Venetian");
  expect(calls).toEqual([]);
  const text = element.querySelector("span");
  expect(text?.getAttribute("data-lines")).toBe("1");
  expect(text?.getAttribute("data-ellipsize")).toBe("tail");
  expect(element.querySelector("[data-scroll]")).toBeNull();
});
