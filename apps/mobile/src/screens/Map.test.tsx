import { makeRecordingStore, type CachedVenue } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { VenueId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, createContext, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const openStore = async () => {
  let documentState: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => documentState,
    commit: async (_revision, payload) => {
      documentState = { revision: documentState.revision + 1, payload };

      return documentState.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  await store.ready;

  return store;
};

const setupMapTest = async (
  store: Awaited<ReturnType<typeof openStore>>,
  platform: "ios" | "android" = "android",
) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const navigate = vi.fn();
  const setOptionsCalls: Array<{ readonly headerShown?: boolean }> = [];

  vi.doMock("@react-navigation/native", () => ({
    useNavigation: () => ({
      setOptions: (options: { readonly headerShown?: boolean }) => setOptionsCalls.push(options),
      navigate,
    }),
  }));

  const Container = ({
    children,
    accessibilityLabel,
    onPress,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    onPress?: (event?: { stopPropagation: () => void }) => void;
  }) =>
    onPress ? (
      <button
        aria-label={accessibilityLabel}
        onClick={() => onPress({ stopPropagation: () => {} })}
      >
        {children}
      </button>
    ) : (
      <div>{children}</div>
    );

  vi.doMock("react-native", () => ({
    Text: Container,
    View: Container,
    ScrollView: Container,
    Pressable: Container,
    Platform: { OS: platform },
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  }));
  vi.doMock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }));
  vi.doMock("react-native-svg", () => ({
    default: Container,
    Line: () => null,
    Path: () => null,
    Polyline: () => null,
    Rect: () => null,
  }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: "light" }),
    useCSSVariable: (names: ReadonlyArray<string> | string) =>
      Array.isArray(names) ? names.map(() => "#15803D") : "#15803D",
  }));
  vi.doMock("expo-maps", () => ({
    AppleMaps: { View: () => null, MapColorScheme: { LIGHT: "light", DARK: "dark" } },
    GoogleMaps: { View: () => null, MapColorScheme: { LIGHT: "light", DARK: "dark" } },
  }));
  vi.doMock("../lib/config", () => ({ googleMapsEnabled: false }));
  vi.doMock("../lib/account", () => ({
    useAccount: () => ({ available: false, isLoaded: true, isSignedIn: false, userId: null }),
  }));
  vi.doMock("../lib/stacks", () => ({
    StacksProvider: Container,
    useStacks: () => ({}),
  }));
  vi.doMock("../components/ui/tabBar", () => ({
    TabBarHeight: createContext(56),
    LiveAccessoryHeight: createContext(0),
  }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    SheetHost: Container,
    Sheet: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? <section>{children}</section> : null,
  }));
  vi.doMock("../features/Personal", () => ({
    PersonalScreen: ({ children }: { children: ReactNode }) => <main>{children}</main>,
    PersonalYouButton: () => null,
  }));
  vi.doMock("../features/LiveBar", () => ({ PersonalLiveBar: () => null }));
  vi.doMock("../features/NativeHeaderActions", () => ({ useNativeHeaderActions: () => null }));
  vi.doMock("../components/ui/Toolbar", () => ({
    Toolbar: Object.assign(
      ({ placement, children }: { placement: string; children?: ReactNode }) => (
        <nav data-placement={placement}>{children}</nav>
      ),
      {
        Button: ({
          label,
          accessibilityLabel,
          onPress,
        }: {
          label?: string;
          accessibilityLabel?: string;
          onPress: () => void;
        }) => (
          <button aria-label={accessibilityLabel} onClick={onPress}>
            {label}
          </button>
        ),
      },
    ),
  }));
  vi.doMock("../components/Money", () => ({
    Money: ({ amount }: { amount: number }) => (
      <span>{amount >= 0 ? `+$${amount / 100}` : `-$${Math.abs(amount) / 100}`}</span>
    ),
  }));

  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  const { MapScreen } = await import("./Map");
  const element = document.createElement("div");
  const root = createRoot(element);
  await act(async () =>
    root.render(
      <RecordingProvider store={store}>
        <MapScreen />
      </RecordingProvider>,
    ),
  );

  return { element, root, navigate, setOptionsCalls };
};

it("shows empty state before any finished sessions", async () => {
  const store = await openStore();
  const { element, root, setOptionsCalls } = await setupMapTest(store);

  try {
    expect(element.textContent).toContain("No casinos on the map yet");
    expect(setOptionsCalls).toEqual([{ headerShown: true }]);
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});

it("renders venue pins, unmapped count, day path filter, and venue sheet linking to Play offline", async () => {
  const store = await openStore();

  const wynn: CachedVenue = {
    id: VenueId.make("0192e7a0-0000-7000-8000-000000000001"),
    name: "Wynn Las Vegas",
    kind: "casino",
    city: "Las Vegas",
    region: "NV",
    country: "US",
    lat: 36.1265,
    lng: -115.1656,
  };

  await store.execute(
    store.prepare({
      type: "record_completed",
      buyIn: 20000,
      cashOut: 34500,
      startedAt: DateTime.makeUnsafe("2026-11-07T20:00:00Z"),
      finishedAt: DateTime.makeUnsafe("2026-11-07T22:10:00Z"),
      game: "craps",
      venueId: wynn.id,
    }),
    [wynn],
  );
  const wynnVisitId = store.getSnapshot().state!.visits[0]!.id;
  await store.execute(
    store.prepare({
      type: "record_completed",
      buyIn: 10000,
      cashOut: 15000,
      startedAt: DateTime.makeUnsafe("2026-11-06T20:00:00Z"),
      finishedAt: DateTime.makeUnsafe("2026-11-06T21:00:00Z"),
      game: "blackjack",
    }),
  );

  const { element, root, navigate, setOptionsCalls } = await setupMapTest(store);

  try {
    expect(setOptionsCalls).toEqual([{ headerShown: false }]);
    expect(element.textContent).toContain("All casinos");
    expect(element.textContent).toContain("1 session has no saved location");
    expect(element.textContent).toContain("Wynn Las Vegas");

    const pinButton = [...element.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label")?.startsWith("Wynn Las Vegas"),
    );

    expect(pinButton).toBeDefined();
    await act(async () => pinButton!.click());
    expect(element.textContent).toContain("Las Vegas, NV · 1 session · 2h 10m");
    expect(element.textContent).toContain("Craps");

    const sessionRow = [...element.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label")?.startsWith("Craps,"),
    );

    expect(sessionRow).toBeDefined();
    await act(async () => sessionRow!.click());
    expect(navigate).toHaveBeenCalledWith("Play", { visitId: wynnVisitId });

    const filter = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Map filter: All casinos"]',
    )!;

    await act(async () => filter.click());
    expect(element.textContent).not.toContain("Las Vegas, NV · 1 session · 2h 10m");
    const [, day] = element.querySelectorAll<HTMLButtonElement>("section button");
    expect(day).toBeDefined();
    await act(async () => day!.click());
    expect(element.querySelector('button[aria-label^="1. Wynn Las Vegas"]')).not.toBeNull();
    expect(element.textContent).toContain("in the order you played");
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});

it("keeps the native bar on iOS and puts the filter in it", async () => {
  const store = await openStore();

  const wynn: CachedVenue = {
    id: VenueId.make("0192e7a0-0000-7000-8000-000000000001"),
    name: "Wynn Las Vegas",
    kind: "casino",
    city: "Las Vegas",
    region: "NV",
    country: "US",
    lat: 36.1265,
    lng: -115.1656,
  };

  await store.execute(
    store.prepare({
      type: "record_completed",
      buyIn: 20000,
      cashOut: 34500,
      startedAt: DateTime.makeUnsafe("2026-11-07T20:00:00Z"),
      finishedAt: DateTime.makeUnsafe("2026-11-07T22:10:00Z"),
      game: "craps",
      venueId: wynn.id,
    }),
    [wynn],
  );

  const { element, root, setOptionsCalls } = await setupMapTest(store, "ios");

  try {
    expect(setOptionsCalls).toEqual([]);
    const left = element.querySelector('nav[data-placement="left"]')!;
    expect(left.textContent).toBe("All casinos");
    expect(left.querySelector('button[aria-label="Clear map filter"]')).toBeNull();

    await act(async () => left.querySelector<HTMLButtonElement>("button")!.click());
    const [, day] = element.querySelectorAll<HTMLButtonElement>("section button");
    await act(async () => day!.click());

    const filtered = element.querySelector('nav[data-placement="left"]')!;
    expect(filtered.textContent).not.toBe("All casinos");

    const clear = filtered.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear map filter"]',
    );

    expect(clear).not.toBeNull();
    await act(async () => clear!.click());
    expect(element.querySelector('nav[data-placement="left"]')!.textContent).toBe("All casinos");
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});

it("has no filter in the iOS bar before there is anything to filter", async () => {
  const store = await openStore();
  const { element, root } = await setupMapTest(store, "ios");

  try {
    expect(element.querySelector('nav[data-placement="left"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
