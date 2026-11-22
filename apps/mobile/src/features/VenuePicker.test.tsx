import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { CachedVenue } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingVisit } from "@stacks/client-runtime/recordingView";
import { VenueId, type ResolvePublicVenueRequest } from "@stacks/contracts";
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

import type { AppleMapsPlace } from "../../modules/apple-maps-search/src";

const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

type SearchState = {
  status: "offline" | "searching" | "found" | "saved";
  venues: ReadonlyArray<CachedVenue>;
  retry: () => void;
  resolveVenue: (place: typeof ResolvePublicVenueRequest.Type) => Promise<CachedVenue>;
};

type AppleSearch = { searchCasinos: () => Promise<ReadonlyArray<AppleMapsPlace>> };

type Slot<A> = { current: A };

const mocks = vi.hoisted(() => {
  const idleSearch = () =>
    ({
      status: "offline",
      venues: [],
      retry: () => {},
      resolveVenue: () => Promise.reject(new Error("unset")),
    }) satisfies SearchState;

  const search: Slot<SearchState> = { current: idleSearch() };
  const apple: Slot<AppleSearch | null> = { current: null };

  return {
    permission: { current: () => Promise.resolve({ granted: false }) },
    idleSearch,
    search,
    apple,
  };
});

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Pressable: ({
    accessibilityLabel,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
  ActivityIndicator: () => <span role="progressbar" aria-label="Saving" />,
  Switch: () => null,
  Text: Container,
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel?: string;
    value?: string;
    onChangeText?: (next: string) => void;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      onChange={(event) => onChangeText?.(event.target.value)}
    />
  ),
  View: ({
    accessibilityLabel,
    children,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
  }) => <div aria-label={accessibilityLabel}>{children}</div>,
}));

vi.mock("uniwind", () => ({ useCSSVariable: () => "#999999" }));

vi.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: () => mocks.permission.current(),
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
  getCurrentPositionAsync: () =>
    Promise.resolve({ coords: { latitude: 36.1126, longitude: -115.1767 } }),
}));

vi.mock("../../modules/apple-maps-search/src", () => ({
  get appleMapsSearch() {
    return mocks.apple.current;
  },
}));

vi.mock("@stacks/client-runtime/recordingReact", async (original) => ({
  ...(await original<typeof import("@stacks/client-runtime/recordingReact")>()),
  useVenueSearch: () => mocks.search.current,
}));

vi.mock("../components/ui/Button", () => ({
  Button: ({
    label,
    onPress,
    testID,
  }: {
    label: string;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button type="button" onClick={onPress} data-testid={testID}>
      {label}
    </button>
  ),
}));

vi.mock("../components/ui/Field", () => ({
  Choice: () => null,
  FormError: ({ children }: { children?: ReactNode }) => <div role="alert">{children}</div>,
  TextField: () => null,
}));

vi.mock("../components/ui/Sheet", () => ({
  SheetHost: Container,
  Sheet: ({
    title,
    back,
    busy,
    onClose,
    footer,
    children,
  }: {
    title: string;
    back?: boolean;
    busy?: boolean;
    onClose: () => void;
    footer?: ReactNode;
    children?: ReactNode;
  }) => (
    <section aria-label={title} aria-busy={busy}>
      {back ? (
        <button aria-label="Back" onClick={onClose}>
          Back
        </button>
      ) : null}
      {children}
      {footer}
    </section>
  ),
}));

vi.mock("../components/ui/Icon", () => ({ Icon: () => null }));

vi.mock("../components/ui/DateTimeField", () => ({ DateTimeField: () => null }));

vi.mock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));

vi.mock("../components/ui/ControlSurface", () => ({ ControlSurface: Container }));

vi.mock("../components/ui/PressableScale", () => ({
  PressableScale: ({
    accessibilityLabel,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("../components/ui/Surface", () => ({
  List: Container,
  Row: ({
    accessibilityLabel,
    accessibilityState,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-selected={accessibilityState?.selected}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  Skeleton: () => null,
  Surface: Container,
}));

vi.mock("../components/Money", () => ({ Money: () => null }));

vi.mock("../lib/recording", () => ({ useRecordingState: () => null }));

vi.mock("../lib/stacks", () => ({ useAction: () => null, useStacks: () => null }));

vi.mock("./AmountKeypad", () => ({
  AmountKeypad: ({ onKey }: { onKey: (key: string) => void }) => (
    <button type="button" aria-label="Enter 5" onClick={() => onKey("5")}>
      5
    </button>
  ),
}));

vi.mock("./Chip", () => ({ Chip: () => null }));

vi.mock("./TableTrip", () => ({
  TripPickerSheet: () => null,
  TripRow: () => null,
  useTripPickable: () => false,
}));

afterEach(() => {
  mocks.permission.current = () => Promise.resolve({ granted: false });
  mocks.apple.current = null;
  mocks.search.current = mocks.idleSearch();
  vi.unstubAllGlobals();
});

const venueNamed = (name: string, lat: number, lng: number) =>
  ({
    id: VenueId.make(crypto.randomUUID()),
    name,
    kind: "casino",
    city: "Las Vegas",
    region: "NV",
    country: "US",
    lat,
    lng,
  }) satisfies CachedVenue;

const place = (name: string, lat: number, lng: number) =>
  ({
    name,
    address: `${name} address`,
    city: "Las Vegas",
    region: "NV",
    country: "US",
    lat,
    lng,
  }) satisfies AppleMapsPlace;

const makeStore = (failCommits = { current: false }) => {
  let documentValue: RecordingStorageDocument = { revision: 0 };

  return makeRecordingStore({
    load: async () => documentValue,
    commit: async (revision, payload) => {
      if (failCommits.current) throw new Error("disk full");
      documentValue = { revision: revision + 1, payload };

      return documentValue.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });
};

const mount = async (
  render: (store: ReturnType<typeof makeStore>) => ReactNode,
  store = makeStore(),
) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  await store.ready;
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () =>
    root.render(<RecordingProvider store={store}>{render(store)}</RecordingProvider>),
  );

  return {
    host,
    store,
    row: (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!,
    skeleton: () => host.querySelector('[aria-label="Loading"]'),
    unmount: async () => {
      await act(async () => root.unmount());
      await store.close();
    },
  };
};

it("saves the casino the moment it is tapped and returns, with no Save button", async () => {
  const { VenueSheet } = await import("./RecordingForms");
  const bellagio = venueNamed("Bellagio", 36.1126, -115.1767);
  mocks.search.current = { ...mocks.search.current, status: "saved", venues: [bellagio] };
  const store = makeStore();
  await store.ready;
  await store.execute(store.prepare({ type: "start", buyIn: 20000 }));

  const visit = recordingVisit(
    store.getSnapshot().state!,
    store.getSnapshot().state!.visits[0]!.id,
  )!;

  const saved = vi.fn();

  const view = await mount(
    () => <VenueSheet visit={visit} onClose={() => {}} onSaved={saved} />,
    store,
  );

  try {
    expect(view.host.textContent).not.toContain("Save casino");
    expect(view.row("Not listed").getAttribute("aria-selected")).toBe("true");
    await act(async () => view.row("Bellagio").click());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBe(bellagio.id);
  } finally {
    await view.unmount();
  }
});

it("keeps an uncached casino distinct from Not listed, and clears it only when Not listed is tapped", async () => {
  const { VenueSheet } = await import("./RecordingForms");
  const venueId = VenueId.make(crypto.randomUUID());
  const store = makeStore();
  await store.ready;
  const start = store.prepare({ type: "start", buyIn: 20000, venueId });
  await store.execute(start);

  if (!("visitId" in start)) throw new Error("Expected a visit");
  const visit = recordingVisit(store.getSnapshot().state!, start.visitId)!;
  const saved = vi.fn();

  const view = await mount(
    () => <VenueSheet visit={visit} onClose={() => {}} onSaved={saved} />,
    store,
  );

  try {
    expect(view.row("Not listed").getAttribute("aria-selected")).toBe("false");
    expect(view.host.textContent).toContain("Current casino unavailable");
    expect(saved).not.toHaveBeenCalled();
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBe(venueId);

    await act(async () => view.row("Not listed").click());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("stays open with the error when saving fails, and saves on the next tap", async () => {
  const { VenueSheet } = await import("./RecordingForms");
  const bellagio = venueNamed("Bellagio", 36.1126, -115.1767);
  mocks.search.current = { ...mocks.search.current, status: "saved", venues: [bellagio] };
  const failing = { current: false };
  const store = makeStore(failing);
  await store.ready;
  await store.execute(store.prepare({ type: "start", buyIn: 20000 }));

  const visit = recordingVisit(
    store.getSnapshot().state!,
    store.getSnapshot().state!.visits[0]!.id,
  )!;

  const saved = vi.fn();

  const view = await mount(
    () => <VenueSheet visit={visit} onClose={() => {}} onSaved={saved} />,
    store,
  );

  try {
    failing.current = true;
    await act(async () => view.row("Bellagio").click());
    expect(saved).not.toHaveBeenCalled();
    expect(view.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.host.querySelector("section")!.getAttribute("aria-busy")).toBe("false");

    failing.current = false;
    await act(async () => view.row("Bellagio").click());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBe(bellagio.id);
  } finally {
    await view.unmount();
  }
});

it("opens a dedicated default casino sheet that selects and hands back to the caller", async () => {
  const { CasinoPickerSheet } = await import("./VenuePicker");
  const selected = vi.fn();
  const closed = vi.fn();

  const view = await mount(() => (
    <CasinoPickerSheet
      context="default"
      selectedId={VenueId.make(crypto.randomUUID())}
      selected={null}
      onSelect={selected}
      onClose={closed}
    />
  ));

  try {
    expect(view.host.querySelector('section[aria-label="Default casino"]')).not.toBeNull();
    expect(view.host.textContent).toContain("Start new sessions without a casino");
    expect(view.host.textContent).not.toContain("Not listed");
    await act(async () => view.row("Not set").click());
    expect(selected).toHaveBeenCalledWith(null);
    expect(closed).not.toHaveBeenCalled();
  } finally {
    await view.unmount();
  }
});

it("shows the row skeleton instead of Near me or Searching while location resolves", async () => {
  const { CasinoPickerSheet } = await import("./VenuePicker");
  let allow = () => {};

  mocks.permission.current = () =>
    new Promise((resolve) => (allow = () => resolve({ granted: false })));

  const view = await mount(() => (
    <CasinoPickerSheet selectedId={null} selected={null} onSelect={() => {}} onClose={() => {}} />
  ));

  try {
    expect(view.skeleton()).not.toBeNull();
    expect(view.host.textContent).not.toContain("Near me");
    expect(view.host.textContent).not.toContain("Searching");

    await act(async () => allow());
    expect(view.skeleton()).toBeNull();
    expect(view.host.textContent).toContain("Near me");
  } finally {
    await view.unmount();
  }
});

it("goes from the skeleton straight to nearby Apple Maps casinos when location is allowed", async () => {
  const { CasinoPickerSheet } = await import("./VenuePicker");
  mocks.permission.current = () => Promise.resolve({ granted: true });
  let finish = (_places: ReadonlyArray<AppleMapsPlace>) => {};

  mocks.apple.current = {
    searchCasinos: () => new Promise((resolve) => (finish = resolve)),
  };

  const saved = venueNamed("Bellagio", 36.1126, -115.1767);

  const view = await mount(() => (
    <CasinoPickerSheet
      selectedId={saved.id}
      selected={saved}
      onSelect={() => {}}
      onClose={() => {}}
    />
  ));

  try {
    expect(view.skeleton()).not.toBeNull();
    expect(view.host.textContent).not.toContain("Near me");
    expect(view.host.textContent).not.toContain("Searching");

    await act(async () =>
      finish([place("Bellagio", 36.1127, -115.1766), place("Aria", 36.1076, -115.1765)]),
    );
    expect(view.skeleton()).toBeNull();
    expect(view.host.textContent).not.toContain("Near me");
    expect(view.row("Bellagio").getAttribute("aria-selected")).toBe("true");
    expect(view.row("Aria").getAttribute("aria-selected")).toBe("false");
    expect(view.row("Not listed")).not.toBeNull();
  } finally {
    await view.unmount();
  }
});

it("resolves a tapped Apple Maps place, shows the failure, and retries from the same sheet", async () => {
  const { CasinoPickerSheet } = await import("./VenuePicker");
  mocks.permission.current = () => Promise.resolve({ granted: true });
  mocks.apple.current = {
    searchCasinos: () => Promise.resolve([place("Aria", 36.1076, -115.1765)]),
  };
  const resolved = venueNamed("Aria", 36.1076, -115.1765);

  let attempts = 0;

  const resolveVenue = async () => {
    attempts += 1;

    if (attempts === 1) throw new Error("offline");

    return resolved;
  };

  mocks.search.current = { ...mocks.search.current, resolveVenue };
  const selected = vi.fn();
  const closed = vi.fn();

  const view = await mount(() => (
    <CasinoPickerSheet selectedId={null} selected={null} onSelect={selected} onClose={closed} />
  ));

  try {
    await act(async () => view.row("Aria").click());
    expect(selected).not.toHaveBeenCalled();
    expect(view.host.querySelector('[role="alert"]')!.textContent).toContain(
      "Couldn't save that casino",
    );
    expect(closed).not.toHaveBeenCalled();

    await act(async () => view.row("Aria").click());
    expect(selected).toHaveBeenCalledWith(resolved);
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("blocks dismissal and shows a spinner on the tapped row while it saves", async () => {
  const { CasinoPickerSheet } = await import("./VenuePicker");
  const bellagio = venueNamed("Bellagio", 36.1126, -115.1767);
  mocks.search.current = { ...mocks.search.current, status: "saved", venues: [bellagio] };
  let finish = () => {};

  const view = await mount(() => (
    <CasinoPickerSheet
      selectedId={null}
      selected={null}
      onSelect={() => new Promise<void>((resolve) => (finish = resolve))}
      onClose={() => {}}
    />
  ));

  try {
    await act(async () => view.row("Bellagio").click());
    expect(view.host.querySelector("section")!.getAttribute("aria-busy")).toBe("true");
    expect(view.row("Bellagio").querySelector('[role="progressbar"]')).not.toBeNull();

    await act(async () => finish());
    expect(view.host.querySelector("section")!.getAttribute("aria-busy")).toBe("false");
    expect(view.row("Bellagio").querySelector('[role="progressbar"]')).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("shows a clear button in the Android search bar only once text is typed", async () => {
  const { SearchablePickerSheet } = await import("../components/ui/SearchablePickerSheet");
  const typed = vi.fn();

  const Harness = () => {
    const [query, setQuery] = useState("");

    return (
      <SearchablePickerSheet
        open
        title="Casino"
        placeholder="Search casinos"
        query={query}
        onQueryChange={(next) => {
          typed(next);
          setQuery(next);
        }}
        onClose={() => {}}
      >
        <div />
      </SearchablePickerSheet>
    );
  };

  const view = await mount(() => <Harness />);

  const input = () =>
    view.host.querySelector<HTMLInputElement>('input[aria-label="Search casinos"]')!;

  const clear = () =>
    view.host.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');

  try {
    expect(clear()).toBeNull();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

    await act(async () => {
      setValue.call(input(), "bel");
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(typed).toHaveBeenLastCalledWith("bel");
    expect(clear()).not.toBeNull();

    await act(async () => clear()!.click());
    expect(typed).toHaveBeenLastCalledWith("");
    expect(clear()).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("preserves the entered buy-in when backing out of the start session casino sheet", async () => {
  const { StartSheet } = await import("./RecordingForms");
  const started = vi.fn();
  const store = makeStore();

  const view = await mount(() => <StartSheet onClose={() => {}} onStarted={started} />, store);

  const click = (selector: string) =>
    act(async () => view.host.querySelector<HTMLButtonElement>(selector)!.click());

  try {
    await click('button[aria-label="Enter 5"]');
    await click('button[aria-label="Casino: Not set. Change"]');
    expect(view.host.querySelector('section[aria-label="Casino"]')).not.toBeNull();
    expect(view.host.querySelector('section[aria-label="Start session"]')).toBeNull();
    await click('section[aria-label="Casino"] button[aria-label="Back"]');
    await click('section[aria-label="Start session"] [data-testid="sheet-submit"]');
    expect(started).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state?.entries[0]?.amount).toBe(500);
  } finally {
    await view.unmount();
  }
});

it("returns to Start session with the chosen casino as soon as one is tapped", async () => {
  const { StartSheet } = await import("./RecordingForms");
  const bellagio = venueNamed("Bellagio", 36.1126, -115.1767);
  mocks.search.current = { ...mocks.search.current, status: "saved", venues: [bellagio] };

  const view = await mount(() => <StartSheet onClose={() => {}} onStarted={() => {}} />);

  const click = (selector: string) =>
    act(async () => view.host.querySelector<HTMLButtonElement>(selector)!.click());

  try {
    await click('button[aria-label="Casino: Not set. Change"]');
    await click('button[aria-label="Bellagio"]');
    expect(view.host.querySelector('section[aria-label="Casino"]')).toBeNull();
    expect(view.host.querySelector('button[aria-label^="Casino: Bellagio"]')).not.toBeNull();
  } finally {
    await view.unmount();
  }
});
