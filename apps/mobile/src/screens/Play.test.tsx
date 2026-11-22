import { makeRecordingStore } from "@stacks/client-runtime/recording";
import { recordingTable } from "@stacks/client-runtime/recordingView";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

it("shows Undo without a ToastHost and keeps guests reachable after deleting the starter", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  await store.execute(store.prepare({ type: "start", buyIn: 20000 }));
  const visit = store.getSnapshot().state!.visits[0]!;
  await store.execute(
    store.prepare({ type: "join_table", tableId: visit.tableId, displayName: "Bea", buyIn: 10000 }),
  );
  const guest = store.getSnapshot().state!.visits[1]!;
  const dispatch = vi.fn();
  const setParams = vi.fn();
  const navigation = { setOptions: vi.fn(), setParams, dispatch };
  vi.doMock("@react-navigation/native", () => ({
    useNavigation: () => navigation,
    StackActions: {
      push: (screen: string, params: { readonly visitId: string }) => ({ screen, params }),
    },
  }));
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  class Value {
    interpolate() {
      return 0;
    }
    stopAnimation() {}
  }

  vi.doMock("react-native", () => ({
    Text: Container,
    View: Container,
    Pressable: ({
      accessibilityLabel,
      children,
      onPress,
    }: {
      accessibilityLabel?: string;
      children?: ReactNode;
      onPress?: () => void;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
    Platform: { OS: "ios" },
    useWindowDimensions: () => ({ fontScale: 1 }),
    Animated: { Value, View: Container },
  }));
  vi.doMock("../components/ui/motion", () => ({ animate: () => {}, duration: {}, ease: {} }));
  vi.doMock("../components/ui/confirmAction", () => ({
    confirmAction: (_title: string, _message: string, _label: string, confirm: () => void) =>
      confirm(),
  }));

  const Button = ({
    label,
    accessibilityLabel,
    onPress,
  }: {
    label?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
  }) => <button onClick={onPress}>{label ?? accessibilityLabel}</button>;

  vi.doMock("../components/ui/Button", () => ({ Button, IconButton: Button }));
  vi.doMock("../components/ui/ActionMenu", () => ({
    ActionMenu: ({ actions }: { actions: { label: string; onPress: () => void }[] }) =>
      actions.map((a) => <Button key={a.label} {...a} />),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    SheetHost: Container,
    Sheet: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  }));
  vi.doMock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));
  vi.doMock("../components/ui/HeaderTitle", () => ({ HeaderTitle: () => null }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/ui/DateTimeField", () => ({ DateTimeField: () => null }));
  vi.doMock("../features/Chip", () => ({ Chip: () => null }));
  vi.doMock("../components/Money", () => ({ Money: () => null }));
  vi.doMock("../components/ui/Field", () => ({ FormError: Container }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: Container,
    List: Container,
    Row: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
      onPress ? <button onClick={onPress}>{children}</button> : <div>{children}</div>,
    SectionHeading: Container,
    Skeleton: () => null,
  }));
  vi.doMock("../features/Personal", () => ({
    PersonalScreen: ({
      children,
      dock,
      toast,
    }: {
      children: ReactNode;
      dock?: ReactNode;
      toast?: ReactNode;
    }) => (
      <main>
        {children}
        <footer>
          {toast}
          {dock}
        </footer>
      </main>
    ),
    SaveStatus: () => null,
  }));
  vi.doMock("../features/RecordingForms", () => ({
    CashOutSheet: () => <div>Cash out sheet</div>,
    VenueSheet: ({ onSaved }: { onSaved: () => void }) => (
      <button onClick={onSaved}>Pick a casino</button>
    ),
  }));
  vi.doMock("../features/TableTrip", () => ({
    TableTripSheet: () => null,
    TableTripButton: () => null,
  }));
  vi.doMock("../features/LiveBar", () => ({ LiveSessionsBar: () => null }));
  vi.doMock("../lib/recording", () => ({
    useRecordingState: () => useSyncExternalStore(store.subscribe, store.getSnapshot).state,
  }));
  vi.doMock("../features/SharedTable", () => ({
    TableSection: ({ onOpen }: { onOpen: (id: typeof guest.id) => void }) => {
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot).state!;

      return recordingTable(state, visit.tableId)
        ?.visits.filter((v) => !v.isSelf)
        .map((v) => (
          <Button
            key={v.visit.id}
            label={v.player.displayName}
            onPress={() => onOpen(v.visit.id)}
          />
        ));
    },
  }));
  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  const { PlayScreen } = await import("./Play");
  const element = document.createElement("div");
  const root = createRoot(element);

  const click = async (label: string, within: ParentNode = element) => {
    const button = [...within.querySelectorAll("button")].find(
      (b) => b.textContent === label || b.getAttribute("aria-label")?.startsWith(label + ","),
    );

    expect(button, label).toBeDefined();
    await act(async () => button!.click());
  };

  try {
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <PlayScreen route={{ params: { visitId: visit.id } }} />
        </RecordingProvider>,
      ),
    );
    await click("Bea");
    await click("+ $100", element.querySelector("section")!);
    await click("Undo");
    expect(element.textContent).toContain("Rebuy undone.");
    expect(element.textContent).not.toContain("View entry");
    await click("Dismiss");
    await click("Edit my session");
    await click("CasinoNot set");
    expect(element.textContent).not.toContain("Delete my visit");
    await click("Pick a casino");
    expect(element.textContent).toContain("Casino saved.");
    expect(element.textContent).toContain("Delete my visit");
    await click("Delete my visit");
    expect(element.querySelector("footer")!.textContent).toContain("Session deletedUndoDismiss");
    await click("Bea");
    expect(dispatch).toHaveBeenCalledWith({ screen: "Play", params: { visitId: guest.id } });
    expect(store.getSnapshot().state!.visits[0]!.deletedAt).toBeDefined();
    await click("Undo");
    expect(store.getSnapshot().state!.visits[0]!.deletedAt).toBeUndefined();
    expect(element.querySelector("footer")!.textContent).not.toContain("Session deleted");

    setParams.mockClear();
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <PlayScreen route={{ params: { visitId: visit.id, action: "cash_out" } }} />
        </RecordingProvider>,
      ),
    );
    expect(element.textContent).toContain("Cash out sheet");
    expect(setParams).toHaveBeenCalledWith({ action: undefined });

    await store.execute(store.prepare({ type: "finish", visitId: visit.id, amount: 25000 }));
    setParams.mockClear();
    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <PlayScreen
            key="finished"
            route={{ params: { visitId: visit.id, action: "cash_out" } }}
          />
        </RecordingProvider>,
      ),
    );
    expect(element.textContent).not.toContain("Cash out sheet");
    expect(setParams).toHaveBeenCalledWith({ action: undefined });
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
