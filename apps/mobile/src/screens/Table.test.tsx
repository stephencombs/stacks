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

  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  vi.doMock("react-native", () => ({
    Text: Container,
    View: Container,
    Pressable: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
    Platform: { OS: "ios" },
  }));
  vi.doMock("../components/Money", () => ({
    Money: ({ amount }: { amount: number }) => <span>{amount}</span>,
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  }));
  vi.doMock("../components/ui/Field", () => ({ FormError: Container }));
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
    useRecordingSubmit: () => ({ pending: false, error: null, submit: async () => null }),
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
