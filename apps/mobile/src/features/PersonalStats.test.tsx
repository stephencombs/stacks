import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingHome } from "@stacks/client-runtime/recordingView";
import { personalStatsView } from "@stacks/client-runtime/stats";
import { MinorUnits, type CurrencyCode } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";

type Props = {
  children?: ReactNode;
  className?: string;
  accessibilityLabel?: string;
  onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
};

const sessions = [
  { start: "2026-01-10T20:00:00Z", buyIn: 10000, cashOut: 14000 },
  { start: "2026-02-10T20:00:00Z", buyIn: 10000, cashOut: 4000 },
  { start: "2026-03-10T20:00:00Z", buyIn: 10000, cashOut: 22000 },
  { start: "2026-04-10T20:00:00Z", buyIn: 10000, cashOut: 10000 },
  { start: "2026-06-10T20:00:00Z", buyIn: 10000, cashOut: 11000 },
];

async function visits() {
  let saved: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => saved,
    commit: async (revision, payload) => {
      saved = { revision: revision + 1, payload };

      return saved.revision;
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  });

  await store.ready;

  for (const { start, buyIn, cashOut } of sessions) {
    const startedAt = DateTime.makeUnsafe(start);

    await store.execute(
      store.prepare({
        type: "record_completed",
        game: "blackjack",
        buyIn,
        cashOut,
        startedAt,
        finishedAt: DateTime.add(startedAt, { hours: 2 }),
      }),
    );
  }

  const home = recordingHome(store.getSnapshot().state!);

  const view = personalStatsView(
    home.finished,
    { year: 2026 },
    {
      timeZone: DateTime.zoneMakeNamedUnsafe("UTC"),
      now: DateTime.makeUnsafe("2026-11-23T12:00:00Z"),
    },
  );

  if (view.kind !== "stats") throw new Error(view.kind);

  return view;
}

async function render(privacyMode: boolean) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const Container = ({ children, className, accessibilityLabel, onLayout }: Props) => {
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 320, height: 96 } } });
    }, [onLayout]);

    return (
      <div className={className} aria-label={accessibilityLabel}>
        {children}
      </div>
    );
  };

  const mark =
    (kind: string) =>
    ({ fill, stroke, stopColor, opacity }: Record<string, string | number | undefined>) => (
      <i
        data-kind={kind}
        data-fill={fill}
        data-stroke={stroke}
        data-stop={stopColor}
        data-opacity={opacity}
      />
    );

  vi.doMock("react-native", () => ({
    Platform: { OS: "ios" },
    View: Container,
    Text: Container,
    PanResponder: { create: () => ({ panHandlers: {} }) },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  }));
  vi.doMock("react-native-svg", () => ({
    default: Container,
    Circle: mark("circle"),
    Defs: Container,
    Line: mark("line"),
    LinearGradient: Container,
    Path: mark("path"),
    Polyline: mark("polyline"),
    Rect: mark("rect"),
    Stop: mark("stop"),
  }));
  vi.doMock("uniwind", () => ({
    useCSSVariable: (names: ReadonlyArray<string>) =>
      names.map((name) => name.replace("--color-", "")),
  }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/ui/Surface", () => ({
    List: Container,
    Surface: Container,
    Row: Container,
  }));
  vi.doMock("../lib/preferences", async () => ({
    ...(await vi.importActual<typeof import("../lib/preferences")>("../lib/preferences")),
    usePreferences: () => ({ showCents: false, privacyMode }),
  }));
  vi.doMock("./StatsParts", async () => {
    const { formatDisplayMoney } =
      await vi.importActual<typeof import("../lib/preferences")>("../lib/preferences");

    return {
      StatsHeading: ({ children, count }: { children: string; count?: string }) => (
        <h2>
          {children} {count}
        </h2>
      ),
      signed: (
        amount: number,
        currency: CurrencyCode,
        prefs: { showCents: boolean; privacyMode: boolean },
        forAccessibility = false,
      ) =>
        formatDisplayMoney(MinorUnits.make(amount), currency, prefs, {
          signDisplay: "exceptZero",
          forAccessibility,
        }),
    };
  });

  const { StatsHero, MoneySection, PeriodSection, PatternsSection, RecordsSection } =
    await import("./PersonalStats");

  const view = await visits();
  const element = document.createElement("div");
  const errors: unknown[] = [];
  const root = createRoot(element, { onUncaughtError: (error) => errors.push(error) });

  await act(async () =>
    root.render(
      <>
        <StatsHero view={view} />
        <MoneySection money={view.money} />
        {view.bars ? <PeriodSection bars={view.bars} /> : null}
        <PatternsSection
          patterns={[
            {
              key: "x",
              before: "Fridays averaged",
              amount: MinorUnits.make(1200),
              after: " a session, across 5.",
            },
          ]}
        />
        <RecordsSection records={view.records} onOpen={() => undefined} />
      </>,
    ),
  );

  const labels = [...element.querySelectorAll("[aria-label]")].map((node) =>
    node.getAttribute("aria-label"),
  );

  return { element, errors, labels, root, view };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

const bars = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-kind="rect"]')].map((node) => [
    node.dataset.fill,
    node.dataset.opacity,
  ]);

it("draws each month in its own color, with the best and worst solid and the rest faded", async () => {
  const { element, errors, labels, root, view } = await render(false);

  expect(errors).toEqual([]);
  expect(view.bars?.title).toBe("By month");
  expect(bars(element)).toEqual([
    ["win", "0.35"],
    ["loss", "1"],
    ["win", "1"],
    ["win", "0.35"],
  ]);
  expect(element.textContent).toContain("February was your worst at");
  expect(labels).toContain("January, +$40");
  expect(labels).toContain("February, -$60");
  expect(labels).toContain("April, even");
  expect(labels).toContain("May, no play");
  expect(labels.find((label) => label?.startsWith("Result by month"))).toContain("no play");
  await act(async () => root.unmount());
});

it("shows every amount, the rates and the records outside privacy mode", async () => {
  const { element, errors, root } = await render(false);

  expect(errors).toEqual([]);
  expect(element.textContent).toContain("Result · 2026");
  expect(element.textContent).toContain("Return");
  expect(element.textContent).toContain("+$110");
  expect(element.textContent).toContain("+22%");
  expect(element.textContent).toContain("Bought in");
  expect(element.textContent).toContain("Biggest win");
  expect(element.textContent).toContain("Up");
  expect(element.textContent).toContain("from your low");
  await act(async () => root.unmount());
});

it("masks every amount in privacy mode and turns both charts neutral", async () => {
  const { element, errors, labels, root } = await render(true);

  expect(errors).toEqual([]);
  expect(element.textContent).not.toContain("$");
  expect(element.textContent).not.toContain("+22%");
  expect(element.textContent).toContain("60%");
  expect(element.textContent).toContain("••••");
  expect(labels.filter((label) => label?.includes("$"))).toEqual([]);
  expect(labels).toContain("January, Amount hidden");
  expect(bars(element)).toEqual([
    ["fill-strong", "1"],
    ["fill-strong", "1"],
    ["fill-strong", "1"],
    ["fill-strong", "1"],
  ]);

  const line = element.querySelector<HTMLElement>('[data-kind="polyline"]');
  expect(line?.dataset.stroke).toBe("muted");
  const stops = [...element.querySelectorAll<HTMLElement>('[data-kind="stop"]')];
  expect(stops.map((stop) => stop.dataset.stop)).toEqual(["fill-strong", "fill-strong"]);
  await act(async () => root.unmount());
});
