import { formatTime } from "@stacks/client-runtime/format";
import { liveTable } from "@stacks/client-runtime/liveTable";
import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingTable } from "@stacks/client-runtime/recordingView";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const platform = vi.hoisted(() => ({ os: "ios" }));

const openStore = async (game: "poker_cash" | "blackjack" = "poker_cash") => {
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
  await store.execute(store.prepare({ type: "start", game, buyIn: 20000 }));
  const host = store.getSnapshot().state!.visits[0]!;

  await store.execute(
    store.prepare({ type: "join_table", tableId: host.tableId, displayName: "Bea", buyIn: 100000 }),
  );

  const guest = store.getSnapshot().state!.visits[1]!;

  return { store, host, guest };
};

const setup = async (game: "poker_cash" | "blackjack" = "poker_cash") => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

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
    get Platform() {
      return { OS: platform.os };
    },
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
  vi.doMock("../components/ui/motion", () => ({ useReducedMotion: () => false }));
  vi.doMock("../lib/useLargeText", () => ({ useLargeText: () => false }));

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
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));
  vi.doMock("../components/ui/Field", () => ({ Choice: () => null, FormError: Container }));
  vi.doMock("../components/ui/ActionMenu", () => ({ ActionMenu: () => null }));
  vi.doMock("../components/ui/confirmAction", () => ({ confirmAction: () => {} }));
  vi.doMock("../components/Money", () => ({
    Money: ({ amount, testID }: { amount: number; testID?: string }) => (
      <span data-testid={testID}>{amount}</span>
    ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({
      title,
      back,
      depth,
      hideHeader,
      footer,
      onClose,
      children,
    }: {
      title: string;
      back?: boolean;
      depth?: number;
      hideHeader?: boolean;
      footer?: ReactNode;
      onClose: () => void;
      children?: ReactNode;
    }) => (
      <section
        data-title={title}
        data-back={String(!!back)}
        data-depth={String(depth ?? (back ? 1 : 0))}
        data-hide-header={String(!!hideHeader)}
      >
        {hideHeader ? null : <button onClick={onClose}>{back ? "Back" : "Close"}</button>}
        {children}
        <footer>{footer}</footer>
      </section>
    ),
  }));
  vi.doMock("../components/ui/Surface", () => ({
    List: Container,
    Card: Container,
    SectionHeading: ({ children, count }: { children?: ReactNode; count?: string }) => (
      <h2>
        {children} {count}
      </h2>
    ),
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
  }));
  vi.doMock("./PlayerAvatar", () => ({
    PlayerAvatar: () => null,
    PLAYER_SHEET_AVATAR_SIZE: 64,
    TABLE_AVATAR_SIZE: 32,
  }));
  vi.doMock("./ContactPhoto", () => ({
    useContactPhotoLink: () => ({ message: null }),
    ContactPhotoMenu: () => <button>Photo</button>,
  }));
  vi.doMock("./SharedTable", () => ({ ShareSheet: () => null, TableSettingsSheet: () => null }));

  vi.doMock("./RecordingForms", () => ({
    AddPlayerSheet: () => null,
    CashOutSheet: () => <div>Cash out step</div>,
    RebuySheet: () => <div>Other rebuy step</div>,
    ReopenSheet: () => <div>Undo cash-out step</div>,
    SitDownSheet: () => <div>Back at the table step</div>,
    CorrectSheet: ({ onSaved }: { onSaved: (id: string) => void }) => (
      <button onClick={() => onSaved("corrected-entry")}>Save correction</button>
    ),
    VoidSheet: ({ onVoided }: { onVoided: () => void }) => (
      <button onClick={onVoided}>Void this entry</button>
    ),
    VoidSeatingSheet: ({ onVoided }: { onVoided: () => void }) => (
      <button onClick={onVoided}>Void this seat</button>
    ),
  }));

  const { store, host, guest } = await openStore(game);

  vi.doMock("../lib/recording", () => ({
    useRecordingState: () => useSyncExternalStore(store.subscribe, store.getSnapshot).state,
  }));

  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  const { SeatSheet } = await import("./LiveTable");
  const element = document.createElement("div");
  const root = createRoot(element);
  const recorded = vi.fn();
  const closed = vi.fn();

  const seat = () => {
    const table = recordingTable(store.getSnapshot().state!, host.tableId)!;

    return liveTable(table, null).seats.find((item) => item.visitId === guest.id)!;
  };

  const render = () =>
    act(async () =>
      root.render(
        <RecordingProvider store={store}>
          <Sheeted />
        </RecordingProvider>,
      ),
    );

  function Sheeted() {
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot).state!;
    const view = liveTable(recordingTable(state, host.tableId)!, null);

    return (
      <SeatSheet
        seat={seat()}
        table={view}
        onClose={closed}
        onRecorded={recorded}
        onSeated={() => {}}
      />
    );
  }

  const button = (label: string) =>
    [...element.querySelectorAll("button")].find(
      (candidate) =>
        candidate.textContent === label || candidate.getAttribute("aria-label") === label,
    );

  const press = async (label: string) => {
    const target = button(label);

    expect(target, label).toBeDefined();
    await act(async () => target!.click());
  };

  const pressStarting = async (prefix: string) => {
    const target = [...element.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.startsWith(prefix),
    );

    expect(target, prefix).toBeDefined();
    await act(async () => target!.click());
  };

  const labels = () => [...element.querySelectorAll("button")].map((item) => item.textContent);
  const sheet = () => element.querySelector("section");

  return {
    store,
    host,
    guest,
    element,
    recorded,
    closed,
    render,
    press,
    pressStarting,
    labels,
    finishedAt: () =>
      store.getSnapshot().state!.visits.find((item) => item.id === guest.id)!.finishedAt!,
    sheet,
    amount: () => element.querySelector("[data-testid=seat-amount]")?.textContent,
    finish: () =>
      store.execute(store.prepare({ type: "finish", visitId: guest.id, amount: 140000 })),
    rebuy: () =>
      store.execute(
        store.prepare({ type: "add", visitId: guest.id, kind: "buy_in", amount: 50000 }),
      ),
    unmount: async () => {
      await act(async () => root.unmount());
      await store.close();
    },
  };
};

afterEach(() => {
  platform.os = "ios";
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("shows a playing player's name, status and buy-in, with rebuy and cash out", async () => {
  const view = await setup();

  try {
    await view.rebuy();
    await view.render();

    expect(view.element.textContent).toContain("Bea");
    expect(view.element.textContent).toContain(
      `Playing since ${formatTime(view.guest.startedAt)} · 2 buy-ins`,
    );
    expect(view.element.textContent).toContain("Rebuy");
    expect(view.amount()).toBe("150000");
    expect(view.sheet()!.dataset.hideHeader).toBe("false");
    expect(view.labels()).toEqual([
      "Close",
      "Photo",
      "+ $100",
      "+ $200",
      "Other",
      "Cash out",
      "History2 entries",
    ]);
    expect(view.element.textContent).not.toContain("Undo cash-out");
  } finally {
    await view.unmount();
  }
});

it("supplies its own close button on Android, where the sheet has no header", async () => {
  platform.os = "android";
  const view = await setup();

  try {
    await view.render();
    expect(view.sheet()!.dataset.hideHeader).toBe("true");
    expect(view.labels()[0]).toBe("Photo");
    expect(view.labels()).toContain("Close Bea");
    await view.press("Close Bea");
    expect(view.closed).toHaveBeenCalledTimes(1);
  } finally {
    await view.unmount();
  }
});

it("records a quick rebuy for the player and offers it for undo", async () => {
  const view = await setup();

  try {
    await view.render();
    await view.press("+ $100");

    expect(view.recorded).toHaveBeenCalledTimes(1);
    expect(view.recorded.mock.calls[0]![0]).toMatchObject({
      visitId: view.guest.id,
      undo: true,
      text: "Rebuy of $100 for Bea recorded.",
    });
    expect(view.recorded.mock.calls[0]![0].entryId).toBeDefined();
  } finally {
    await view.unmount();
  }
});

it("steps to a cash-out and back", async () => {
  const view = await setup();

  try {
    await view.render();
    await view.press("Cash out");
    expect(view.element.textContent).toContain("Cash out step");
    expect(view.element.textContent).not.toContain("Rebuy");
  } finally {
    await view.unmount();
  }
});

it("shows how a finished player did, and the way back to the table or out of the cash-out", async () => {
  const view = await setup();

  try {
    await view.finish();
    await view.render();

    expect(view.element.textContent).toContain(`Cashed out at ${formatTime(view.finishedAt())}`);
    expect(view.element.textContent).toContain("Result");
    expect(view.amount()).toBe("40000");
    expect(view.element.textContent).toContain("Bought in");
    expect(view.element.textContent).toContain("Cashed out");
    expect(view.labels()).toContain("Back at the table");
    expect(view.labels()).toContain("Undo cash-out");
    expect(view.labels()).not.toContain("Cash out");
    expect(view.labels()).not.toContain("+ $100");

    await view.press("Undo cash-out");
    expect(view.element.textContent).toContain("Undo cash-out step");
  } finally {
    await view.unmount();
  }
});

it("lays a finished player's actions side by side on Android", async () => {
  platform.os = "android";
  const view = await setup();

  try {
    await view.finish();
    await view.render();
    expect(view.labels()).toContain("Back at the table");
    await view.press("Back at the table");
    expect(view.element.textContent).toContain("Back at the table step");
  } finally {
    await view.unmount();
  }
});

it("opens their history in place as a back step, with every entry and the way back", async () => {
  const view = await setup();

  try {
    await view.rebuy();
    await view.render();
    await view.press("History2 entries");

    expect(view.sheet()!.dataset.title).toBe("Bea's history");
    expect(view.sheet()!.dataset.back).toBe("true");
    expect(view.sheet()!.dataset.depth).toBe("1");
    expect(view.element.querySelector("h2")).toBeNull();
    expect(view.labels().filter((label) => label?.startsWith("Buy-in"))).toHaveLength(1);
    expect(view.labels().filter((label) => label?.startsWith("Rebuy"))).toHaveLength(1);

    await view.press("Back");
    expect(view.sheet()!.dataset.depth).toBe("0");
    expect(view.labels()).toContain("Cash out");
  } finally {
    await view.unmount();
  }
});

it("lists the final cash-out and the finish in the history of a finished player", async () => {
  const view = await setup();

  try {
    await view.finish();
    await view.render();
    await view.press("History2 entries");
    expect(view.labels().some((label) => label?.startsWith("Final cash-out"))).toBe(true);
    expect(view.element.textContent).toContain("Finished playing");
  } finally {
    await view.unmount();
  }
});

it("opens an entry from the history, and voiding it records and reports it", async () => {
  const view = await setup();

  try {
    await view.rebuy();
    await view.render();
    await view.press("History2 entries");
    await view.pressStarting("Rebuy");

    expect(view.sheet()!.dataset.title).toBe("Rebuy");
    expect(view.sheet()!.dataset.back).toBe("true");
    expect(view.sheet()!.dataset.depth).toBe("2");
    expect(view.labels()).toContain("Correct amount");

    await view.press("Void entry");
    await view.press("Void this entry");

    expect(view.recorded).toHaveBeenCalledWith({
      visitId: view.guest.id,
      text: "Entry voided. It stays in the history.",
    });
  } finally {
    await view.unmount();
  }
});

it("reports a correction made from the history", async () => {
  const view = await setup();

  try {
    await view.render();
    await view.press("History1 entry");
    await view.pressStarting("Buy-in");
    await view.press("Correct amount");
    await view.press("Save correction");

    expect(view.recorded).toHaveBeenCalledWith({
      visitId: view.guest.id,
      entryId: "corrected-entry",
      text: "Correction saved.",
    });
  } finally {
    await view.unmount();
  }
});

it("opens SeatPickerSheet from Bea's blackjack seat row and inspects seat history", async () => {
  const view = await setup("blackjack");

  try {
    await view.render();
    await view.pressStarting("Seat");
    await view.press("Seat 4, open");
    await view.press("Save Seat 4");

    expect(view.recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: view.guest.id,
        text: "Bea sat at Seat 4.",
        undo: true,
      }),
    );

    await view.press("Seat 2, open");
    await view.press("Save Seats 2 & 4");

    expect(view.recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        visitId: view.guest.id,
        text: "Bea is playing Seats 2 & 4.",
        undo: true,
      }),
    );

    await view.press("Back");
    await view.pressStarting("History");
    expect(view.sheet()!.textContent).toContain("Added Seat 2 · Now Seats 2 & 4");
    await view.pressStarting("Sat at Seat 4");
    expect(view.sheet()!.dataset.title).toBe("Seat 4");
    await view.press("Void seat record");
    await view.press("Void this seat");

    expect(view.recorded).toHaveBeenCalledWith({
      visitId: view.guest.id,
      text: "Seat record voided. It stays in the history.",
    });
  } finally {
    await view.unmount();
  }
});
