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
    useIsFocused: () => true,
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
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    Animated: { Value, View: Container },
  }));
  vi.doMock("react-native-svg", () => ({
    default: Container,
    Circle: Container,
    Defs: Container,
    Ellipse: Container,
    G: Container,
    Line: Container,
    LinearGradient: Container,
    Path: Container,
    RadialGradient: Container,
    Rect: Container,
    Stop: Container,
    Text: Container,
  }));
  vi.doMock("uniwind", () => ({ useCSSVariable: () => [] }));
  vi.doMock("../lib/useLargeText", () => ({ useLargeText: () => false }));
  vi.doMock("../components/ui/motion", () => ({
    animate: () => {},
    duration: {},
    ease: {},
    useReducedMotion: () => false,
  }));
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
    Sheet: ({
      title,
      children,
      footer,
    }: {
      title?: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) => (
      <section aria-label={title}>
        {children}
        {footer}
      </section>
    ),
  }));
  vi.doMock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));
  vi.doMock("../components/ui/HeaderTitle", () => ({ HeaderTitle: () => null }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/ui/DateTimeField", () => ({ DateTimeField: () => null }));
  vi.doMock("../features/PlayerAvatar", () => ({
    PlayerAvatar: () => null,
    TABLE_AVATAR_SIZE: 32,
    PLAYER_SHEET_AVATAR_SIZE: 64,
  }));
  vi.doMock("../features/ShareCardSheet", () => ({
    ShareCardSheet: ({ title }: { title: string }) => <div>Card preview for {title}</div>,
  }));
  vi.doMock("../components/Money", () => ({ Money: () => null }));
  vi.doMock("../components/ui/Field", () => ({ Choice: () => null, FormError: Container }));
  vi.doMock("../components/ui/Surface", () => ({
    Card: Container,
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
    VoidSeatingSheet: ({ onVoided }: { onVoided: () => void }) => (
      <button onClick={onVoided}>Confirm void seat</button>
    ),
  }));
  vi.doMock("../features/TableTrip", () => ({
    TableTripSheet: () => null,
    TripRow: () => null,
    useTripPickable: () => false,
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
    expect(element.textContent).toContain("Edit my session");
    expect(element.textContent).not.toContain("Card preview");
    await click("Share card");
    expect(element.textContent).toContain("Card preview for Session");

    await act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <PlayScreen key="theirs" route={{ params: { visitId: guest.id } }} />
        </RecordingProvider>,
      ),
    );
    expect(element.textContent).toContain("Edit Bea's session");
    expect(element.textContent).not.toContain("Share card");
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});

it("handles solo and shared blackjack seats, undo toast, edit Seat row on iOS/Android, and history inspection", async () => {
  for (const os of ["ios", "android"] as const) {
    vi.resetModules();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    let documentState: RecordingStorageDocument = { revision: 0 };

    const store = makeRecordingStore({
      load: async () => documentState,
      commit: async (revision, payload) => {
        documentState = { revision: revision + 1, payload };

        return documentState.revision;
      },
      subscribe: () => () => {},
      close: async () => {},
    });

    await store.ready;
    await store.execute(store.prepare({ type: "start", game: "blackjack", buyIn: 20000 }));
    const visit = store.getSnapshot().state!.visits[0]!;
    const navigation = { setOptions: vi.fn(), setParams: vi.fn(), dispatch: vi.fn() };

    vi.doMock("@react-navigation/native", () => ({
      useIsFocused: () => true,
      useNavigation: () => navigation,
      StackActions: {
        push: (screen: string, params: { readonly visitId: string }) => ({ screen, params }),
      },
    }));

    const Container = ({
      children,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
    }) => <div aria-label={accessibilityLabel}>{children}</div>;

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
        disabled,
        onPress,
        children,
      }: {
        accessibilityLabel?: string;
        disabled?: boolean;
        onPress?: () => void;
        children?: ReactNode;
      }) => (
        <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>
          {children}
        </button>
      ),
      Platform: { OS: os },
      useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
      Animated: { Value, View: Container },
    }));
    vi.doMock("react-native-svg", () => ({
      default: Container,
      Circle: Container,
      Defs: Container,
      Ellipse: Container,
      G: Container,
      Line: Container,
      LinearGradient: Container,
      Path: Container,
      RadialGradient: Container,
      Rect: Container,
      Stop: Container,
      Text: Container,
    }));
    vi.doMock("uniwind", () => ({ useCSSVariable: () => [] }));
    vi.doMock("../lib/useLargeText", () => ({ useLargeText: () => false }));
    vi.doMock("../components/ui/motion", () => ({
      animate: () => {},
      duration: {},
      ease: {},
      useReducedMotion: () => false,
    }));
    vi.doMock("../components/ui/confirmAction", () => ({ confirmAction: () => {} }));

    const Button = ({
      label,
      accessibilityLabel,
      disabled,
      onPress,
    }: {
      label?: string;
      accessibilityLabel?: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => (
      <button aria-label={accessibilityLabel} disabled={disabled} onClick={onPress}>
        {label ?? accessibilityLabel}
      </button>
    );

    vi.doMock("../components/ui/Button", () => ({ Button, IconButton: Button }));
    vi.doMock("../components/ui/ActionMenu", () => ({
      ActionMenu: ({ actions }: { actions: { label: string; onPress: () => void }[] }) =>
        actions.map((a) => <Button key={a.label} {...a} />),
    }));
    vi.doMock("../components/ui/Sheet", () => ({
      SheetHost: Container,
      Sheet: ({
        title,
        children,
        footer,
      }: {
        title?: string;
        children?: ReactNode;
        footer?: ReactNode;
      }) => (
        <section aria-label={title}>
          {children}
          {footer}
        </section>
      ),
    }));
    vi.doMock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));
    vi.doMock("../components/ui/HeaderTitle", () => ({ HeaderTitle: () => null }));
    vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
    vi.doMock("../components/ui/DateTimeField", () => ({ DateTimeField: () => null }));
    vi.doMock("../features/PlayerAvatar", () => ({
      PlayerAvatar: () => null,
      TABLE_AVATAR_SIZE: 32,
      PLAYER_SHEET_AVATAR_SIZE: 64,
    }));
    vi.doMock("../features/ShareCardSheet", () => ({ ShareCardSheet: () => null }));
    vi.doMock("../components/Money", () => ({ Money: () => null }));
    vi.doMock("../components/ui/Field", () => ({ Choice: () => null, FormError: Container }));
    vi.doMock("../components/ui/Surface", () => ({
      Card: Container,
      EmptyState: Container,
      List: Container,
      Row: ({
        children,
        accessibilityLabel,
        onPress,
      }: {
        children?: ReactNode;
        accessibilityLabel?: string;
        onPress?: () => void;
      }) =>
        onPress ? (
          <button aria-label={accessibilityLabel} onClick={onPress}>
            {children}
          </button>
        ) : (
          <div aria-label={accessibilityLabel}>{children}</div>
        ),
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
      VoidSeatingSheet: ({ onVoided }: { onVoided: () => void }) => (
        <button onClick={onVoided}>Confirm void seat</button>
      ),
    }));
    vi.doMock("../features/TableTrip", () => ({
      TableTripSheet: () => null,
      TripRow: () => null,
      useTripPickable: () => false,
    }));
    vi.doMock("../features/LiveBar", () => ({ LiveSessionsBar: () => null }));
    vi.doMock("../lib/recording", () => ({
      useRecordingState: () => useSyncExternalStore(store.subscribe, store.getSnapshot).state,
    }));
    vi.doMock("../features/SharedTable", () => ({ TableSection: () => null }));

    const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
    const { PlayScreen } = await import("./Play");
    const element = document.createElement("div");
    const root = createRoot(element);

    const click = async (label: string, exact = false) => {
      const button = [...element.querySelectorAll("button")].find((b) =>
        exact
          ? b.textContent === label || b.getAttribute("aria-label") === label
          : b.textContent?.includes(label) || b.getAttribute("aria-label")?.startsWith(label),
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

      await click("+ Pick seat", true);
      await click("Seat 1, first base, open");
      await click("Save Seat 1", true);
      expect(element.textContent).toContain("Sat at Seat 1 · First base.");
      await click("Undo", true);
      expect(element.textContent).toContain("Seat change undone.");

      await click("Edit my session", true);
      expect(element.textContent).toContain("SeatNot set");
      await click("Done", true);

      await store.execute(
        store.prepare({
          type: "join_table",
          tableId: visit.tableId,
          displayName: "Bea",
          buyIn: 10000,
        }),
      );

      const beaVisitId = store.getSnapshot().state!.visits.find((v) => v.id !== visit.id)!.id;

      await store.execute(
        store.prepare({ type: "set_seat", tableId: visit.tableId, visitId: beaVisitId, seat: 1 }),
      );
      await act(async () => {});
      expect(element.querySelector('[aria-label="Seat 5, open"]')).toBeNull();
      expect(element.textContent).toContain("Seat 1 · First base");

      await click("+ Pick seat", true);
      await click("Seat 3, open");
      await click("Save Seat 3", true);
      expect(element.textContent).toContain("Sat at Seat 3.");
      await click("Seat 3", true);
      await click("Seat 4, open");
      await click("Save Seats 3 & 4", true);
      expect(element.textContent).toContain("Playing Seats 3 & 4.");
      expect(element.textContent).toContain("Seats 3 & 4");
      expect(element.textContent).toContain("BeaSeat 1 · First base · Playing");

      if (os === "ios") expect(element.textContent).toContain("YouSeats 3 & 4 · Playing");
      await click("Undo", true);
      expect(element.textContent).toContain("Seat change undone.");

      await store.execute(store.prepare({ type: "finish", visitId: visit.id, amount: 25000 }));
      await act(async () => {});
      expect(element.textContent).toContain("Seat 3");
      await click("Sat at Seat 3");
      await click("Void seat record", true);
      await click("Confirm void seat", true);
      expect(element.textContent).toContain("Seat record voided. It stays in the history.");
    } finally {
      await act(async () => root.unmount());
      await store.close();
      vi.resetModules();
      vi.unstubAllGlobals();
    }
  }
});
