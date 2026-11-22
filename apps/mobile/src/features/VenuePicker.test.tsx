import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingVisit } from "@stacks/client-runtime/recordingView";
import { VenueId } from "@stacks/contracts";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Pressable: ({
    accessibilityLabel,
    accessibilityState,
    onPress,
    children,
  }: {
    accessibilityLabel?: string;
    accessibilityState?: { checked?: boolean };
    onPress?: () => void;
    children?: ReactNode;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      aria-checked={accessibilityState?.checked}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  ActivityIndicator: () => null,
  Switch: () => null,
  Text: Container,
  TextInput: () => null,
  View: Container,
}));

vi.mock("uniwind", () => ({ useCSSVariable: () => "#999999" }));

vi.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
  getCurrentPositionAsync: () => Promise.reject(new Error("No location")),
}));

vi.mock("@stacks/client-runtime/recordingReact", async (original) => ({
  ...(await original<typeof import("@stacks/client-runtime/recordingReact")>()),
  useVenueSearch: () => ({ status: "offline", venues: [], retry: () => {} }),
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
  FormError: Container,
  TextField: () => null,
}));

vi.mock("../components/ui/Sheet", () => ({
  SheetHost: Container,
  Sheet: ({
    title,
    back,
    onClose,
    footer,
    children,
  }: {
    title: string;
    back?: boolean;
    onClose: () => void;
    footer?: ReactNode;
    children?: ReactNode;
  }) => (
    <section aria-label={title}>
      {back ? <button onClick={onClose}>Back</button> : null}
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
  Row: Container,
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

vi.mock("./TableTrip", () => ({ TripChoice: () => null }));

it("keeps an uncached existing casino distinct from Not listed, and clears it only when picked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  const { VenueSheet } = await import("./RecordingForms");
  let documentValue: RecordingStorageDocument = { revision: 0 };

  const adapter = () => ({
    load: async () => documentValue,
    commit: async (revision: number, payload: string) => {
      documentValue = { revision: revision + 1, payload };

      return documentValue.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  let store = makeRecordingStore(adapter());
  await store.ready;
  const venueId = VenueId.make(crypto.randomUUID());
  const start = store.prepare({ type: "start", buyIn: 20000, venueId });
  await store.execute(start);

  if (!("visitId" in start)) throw new Error("Expected a visit");
  const visit = recordingVisit(store.getSnapshot().state!, start.visitId)!;
  const host = document.createElement("div");
  const root = createRoot(host);
  const saved = vi.fn();
  const notListed = () => host.querySelector<HTMLButtonElement>('button[aria-label="Not listed"]')!;

  const button = (label: string) =>
    [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;

  try {
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <VenueSheet visit={visit} onClose={() => {}} onSaved={saved} />
        </RecordingProvider>,
      ),
    );
    expect(notListed().getAttribute("aria-checked")).toBe("false");
    expect(host.textContent).toContain("Current casino unavailable");

    await act(async () => button("Save casino").click());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBe(venueId);
    expect(store.getSnapshot().state!.receipts).toHaveLength(1);

    await act(async () => notListed().click());
    expect(notListed().getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).not.toContain("Current casino unavailable");
    await act(async () => button("Save casino").click());
    expect(saved).toHaveBeenCalledTimes(2);

    await store.close();
    store = makeRecordingStore(adapter());
    await store.ready;
    expect(store.getSnapshot().state!.tables[0]!.venueId).toBeNull();
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.unstubAllGlobals();
  }
});

it("opens a dedicated default casino sheet and closes after selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { CasinoPickerSheet } = await import("./VenuePicker");
  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  let documentValue: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => documentValue,
    commit: async (revision: number, payload: string) => {
      documentValue = { revision: revision + 1, payload };

      return documentValue.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  await store.ready;
  const host = document.createElement("div");
  const root = createRoot(host);
  const selected = vi.fn();
  const closed = vi.fn();

  try {
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <CasinoPickerSheet
            context="default"
            selectedId={null}
            selected={null}
            onSelect={selected}
            onClose={closed}
          />
        </RecordingProvider>,
      ),
    );
    expect(host.querySelector('section[aria-label="Default casino"]')).not.toBeNull();
    expect(host.textContent).toContain("Start new sessions without a casino");
    expect(host.textContent).not.toContain("Not listed");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Not set"]')!.click(),
    );
    expect(selected).toHaveBeenCalledWith(null);
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.unstubAllGlobals();
  }
});

it("preserves the entered buy-in when backing out of the start session casino sheet", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { StartSheet } = await import("./RecordingForms");
  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  let documentValue: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => documentValue,
    commit: async (revision, payload) => {
      documentValue = { revision: revision + 1, payload };

      return documentValue.revision;
    },
    subscribe: () => () => {},
    close: async () => {},
  });

  await store.ready;
  const host = document.createElement("div");
  const root = createRoot(host);
  const started = vi.fn();

  const click = (selector: string) =>
    act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());

  try {
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <StartSheet onClose={() => {}} onStarted={started} />
        </RecordingProvider>,
      ),
    );
    await click('button[aria-label="Enter 5"]');
    await click('button[aria-label="Casino: Not set. Change"]');
    expect(host.querySelector('section[aria-label="Casino"]')).not.toBeNull();
    expect(host.querySelector('section[aria-label="Start session"]')).toBeNull();
    await click('section[aria-label="Casino"] button[aria-label="Close"]');
    await click('section[aria-label="Start session"] [data-testid="sheet-submit"]');
    expect(started).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state?.entries[0]?.amount).toBe(500);
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.unstubAllGlobals();
  }
});
