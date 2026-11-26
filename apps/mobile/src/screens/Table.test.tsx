import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { TableId } from "@stacks/contracts";
import * as Option from "effect/Option";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type NavOptions = { readonly headerShown?: boolean };

type NavParams = { readonly screen: string; readonly params?: { readonly screen: string } };

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

const setupTableScreen = async ({
  store,
  tableId,
}: {
  store: Awaited<ReturnType<typeof openStore>>;
  tableId: string;
}) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setOptionsCalls: NavOptions[] = [];
  const navigateCalls: Array<readonly [string, NavParams]> = [];

  const navigation = {
    setOptions: (options: NavOptions) => setOptionsCalls.push(options),
    navigate: (screen: string, params: NavParams) => navigateCalls.push([screen, params]),
    dispatch: () => {},
  };

  vi.doMock("@react-navigation/native", () => ({
    StackActions: {},
    useIsFocused: () => true,
    useNavigation: () => navigation,
  }));

  const Container = ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <div aria-label={accessibilityLabel}>{children}</div>;

  vi.doMock("react-native", () => ({
    Text: Container,
    View: Container,
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    Pressable: ({
      children,
      accessibilityLabel,
      onPress,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      onPress?: () => void;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
    Platform: { OS: "ios" },
  }));
  vi.doMock("react-native-svg", () => ({
    default: Container,
    Line: Container,
    Path: Container,
    Text: Container,
  }));
  vi.doMock("uniwind", () => ({ useCSSVariable: () => [] }));
  vi.doMock("../lib/useLargeText", () => ({ useLargeText: () => false }));
  vi.doMock("../components/ui/motion", () => ({ useReducedMotion: () => false }));
  vi.doMock("../features/PlayerAvatar", () => ({ PlayerAvatar: () => null }));
  vi.doMock("../components/Money", () => ({
    Money: ({ amount }: { amount: number }) => <span>{amount}</span>,
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  }));
  vi.doMock("../components/ui/Field", () => ({
    FormError: Container,
    Choice: ({
      label,
      options,
      onChange,
    }: {
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      onChange: (value: string) => void;
    }) => (
      <div role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({ title, children }: { title?: string; children?: ReactNode }) => (
      <section aria-label={title}>{children}</section>
    ),
  }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: ({
      title,
      children,
      action,
    }: {
      title: string;
      children?: ReactNode;
      action?: ReactNode;
    }) => (
      <div>
        <h1>{title}</h1>
        <p>{children}</p>
        {action}
      </div>
    ),
  }));
  vi.doMock("../features/LiveBar", () => ({ LiveSessionsBar: () => null }));
  vi.doMock("../features/LiveTable", () => ({
    ActionSlot: () => null,
    LiveClock: () => null,
    LiveHero: () => null,
    SeatSheet: () => null,
    TableActionSheet: () => null,
    TableSeats: () => null,
    useDeleteTable: () => ({ error: null, confirm: () => {} }),
  }));
  vi.doMock("../features/Personal", () => ({ PersonalScreen: Container }));
  vi.doMock("../features/RecordingForms", () => ({ SitDownSheet: () => null }));
  vi.doMock("../lib/account", () => ({
    useAccount: () => ({ available: false, isSignedIn: false }),
  }));
  vi.doMock("../lib/recording", () => ({
    useRecordingState: () => store.getSnapshot().state,
  }));
  vi.doMock("../lib/stacks", () => ({ StacksProvider: Container }));
  vi.doMock("./Play", () => ({ BackButton: Container, RecordingToast: Container }));
  vi.doMock("./Session", () => ({ ImportedSession: Container }));

  const { recordingTable } = await import("@stacks/client-runtime/recordingView");

  vi.doMock("@stacks/client-runtime/recordingReact", () => ({
    useRecordingSubmit: () => ({
      pending: false,
      error: null,
      submit: async (input: Parameters<typeof store.prepare>[0]) =>
        store.execute(store.prepare(input)),
    }),
    useRecordingTable: (id: string) => {
      const current = store.getSnapshot().state;
      const parsed = Option.getOrNull(TableId.makeOption(id));

      return current && parsed ? recordingTable(current, parsed) : null;
    },
    useServerTable: () => null,
    useTableScopes: () => [],
    TableRefresh: () => null,
  }));

  const { TableScreen } = await import("./Table");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TableScreen route={{ params: { tableId } }} />);
  });

  return { container, root, setOptionsCalls, navigateCalls };
};

it("keeps the header and shows a recovery action for invalid and unknown table IDs", async () => {
  const store = await openStore();

  try {
    const invalid = await setupTableScreen({ store, tableId: "not-a-uuid" });

    expect(invalid.container.textContent).toContain("This table isn't on this device");
    expect(invalid.setOptionsCalls).toEqual([]);

    const button = Array.from(invalid.container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Back to your play",
    );

    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(invalid.navigateCalls).toEqual([
      ["Tabs", { screen: "PlayTab", params: { screen: "Home" } }],
    ]);
    await act(async () => invalid.root.unmount());

    const unknown = await setupTableScreen({
      store,
      tableId: "00000000-0000-4000-8000-000000000999",
    });

    expect(unknown.container.textContent).toContain("This table isn't on this device");
    expect(unknown.setOptionsCalls).toEqual([]);
    await act(async () => unknown.root.unmount());
  } finally {
    await store.close();
  }
});

it("hides the native header only when a recorded table is loaded and restores it on unmount", async () => {
  const store = await openStore();

  try {
    await store.execute(store.prepare({ type: "open_table" }));
    const tableId = store.getSnapshot().state!.tables[0]!.id;
    const loaded = await setupTableScreen({ store, tableId });

    expect(loaded.setOptionsCalls).toEqual([{ headerShown: false }]);
    await act(async () => loaded.root.unmount());
    expect(loaded.setOptionsCalls).toEqual([{ headerShown: false }, { headerShown: true }]);
  } finally {
    await store.close();
  }
});

it("renders the blackjack tabletop arc and updates table size with the size control", async () => {
  const store = await openStore();

  try {
    await store.execute(store.prepare({ type: "open_table", game: "blackjack", tableSeats: 5 }));
    const tableId = store.getSnapshot().state!.tables[0]!.id;

    await store.execute(
      store.prepare({ type: "join_table", tableId, displayName: "Bea", buyIn: 20000 }),
    );

    const beaVisitId = store.getSnapshot().state!.visits[0]!.id;

    await store.execute(store.prepare({ type: "set_seat", tableId, visitId: beaVisitId, seat: 1 }));

    const screen = await setupTableScreen({ store, tableId });
    expect(screen.container.textContent).toContain("5 seats");
    expect(
      screen.container.querySelector('[aria-label="Seat 1, first base, occupied by Bea"]'),
    ).not.toBeNull();

    const sizeButton = [...screen.container.querySelectorAll("button")].find(
      (b) => b.textContent === "5 seats",
    );

    await act(async () => sizeButton!.click());

    const sevenButton = [...screen.container.querySelectorAll("button")].find(
      (b) => b.textContent === "7 seats",
    );

    await act(async () => sevenButton!.click());
    expect(store.getSnapshot().state!.tables[0]!.tableSeats).toBe(7);
    await act(async () => screen.root.unmount());
  } finally {
    await store.close();
  }
});
