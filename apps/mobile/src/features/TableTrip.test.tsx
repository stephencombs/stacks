import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingVisit } from "@stacks/client-runtime/recordingView";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TripId,
  UserId,
  type GroupListItem,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

type Slot<A> = { current: A };

type Query = {
  status: "loading" | "failed" | "ready";
  groups: ReadonlyArray<GroupListItem>;
};

const mocks = vi.hoisted(() => {
  const signedIn: Slot<boolean> = { current: true };
  const query: Slot<Query> = { current: { status: "ready", groups: [] } };
  const mounts: Slot<number> = { current: 0 };

  return { signedIn, query, mounts };
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

vi.mock("../components/ui/Field", () => ({
  FormError: ({ children }: { children?: ReactNode }) => <div role="alert">{children}</div>,
}));

vi.mock("../components/ui/Sheet", () => ({
  Sheet: ({
    title,
    busy,
    footer,
    children,
  }: {
    title: string;
    busy?: boolean;
    footer?: ReactNode;
    children?: ReactNode;
  }) => (
    <section aria-label={title} aria-busy={busy}>
      {children}
      {footer}
    </section>
  ),
}));

vi.mock("../components/ui/Icon", () => ({ Icon: () => null }));

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
}));

vi.mock("../lib/account", () => ({
  useAccount: () =>
    mocks.signedIn.current
      ? { available: true, isLoaded: true, isSignedIn: true, userId: "user" }
      : { available: false },
}));

vi.mock("../lib/stacks", () => ({
  StacksProvider: ({ children }: { children?: ReactNode }) => {
    if (!mocks.signedIn.current) throw new Error("Signed-out sessions must not mount Stacks");
    mocks.mounts.current += 1;

    return children;
  },
  useStacks: () => ({ groups: null }),
  Loaded: ({
    skeleton,
    renderError,
    children,
  }: {
    skeleton: ReactNode;
    renderError: (message: string) => ReactNode;
    children: (groups: ReadonlyArray<GroupListItem>) => ReactNode;
  }) => {
    const { status, groups } = mocks.query.current;

    if (status === "loading") return skeleton;

    if (status === "failed") return renderError("offline");

    return children(groups);
  },
}));

afterEach(() => {
  mocks.signedIn.current = true;
  mocks.query.current = { status: "ready", groups: [] };
  mocks.mounts.current = 0;
  vi.unstubAllGlobals();
});

const at = (hour: number) => DateTime.makeUnsafe(Date.UTC(2026, 10, 20, hour));

const groups = () => {
  const trip = (groupId: GroupId, name: string) => ({
    id: TripId.make(crypto.randomUUID()),
    groupId,
    name,
    startedAt: at(9),
    endedAt: null,
    createdBy: UserId.make("owner"),
    createdAt: at(9),
  });

  const group = (name: string, tripNames: ReadonlyArray<string>) => {
    const id = GroupId.make(crypto.randomUUID());

    return {
      group: { id, name, currency: CurrencyCode.make("USD"), createdAt: at(9) },
      role: "owner",
      myPlayerId: PlayerId.make(crypto.randomUUID()),
      myBalance: MinorUnits.make(0),
      liveSessionCount: 0,
      liveTripIds: [],
      currentTripId: null,
      mySession: null,
      trips: tripNames.map((tripName) => trip(id, tripName)),
    } satisfies GroupListItem;
  };

  return [
    group("Thursday crew", ["Vegas Weekend", "Reno"]),
    group("Work friends", ["Atlantic City"]),
  ];
};

const makeStore = (failCommits = { current: false }) => {
  let documentValue: RecordingStorageDocument = { revision: 0 };

  return makeRecordingStore({
    load: async () => documentValue,
    commit: async (revision, payload) => {
      if (failCommits.current) throw new Error("offline");
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
    rows: () =>
      [...host.querySelectorAll("button[aria-label]")].flatMap((button) => {
        const label = button.getAttribute("aria-label");

        return label === "Clear search" ? [] : [label];
      }),
    search: () => host.querySelector<HTMLInputElement>('input[aria-label="Search trips"]')!,
    type: async (text: string) => {
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Search trips"]')!;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

      await act(async () => {
        set.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      await store.close();
    },
  };
};

const startedTable = async (store: ReturnType<typeof makeStore>) => {
  await store.ready;
  await store.execute(store.prepare({ type: "start", buyIn: 20000 }));
  const state = store.getSnapshot().state!;

  return recordingVisit(state, state.visits[0]!.id)!.table;
};

it("lists personal and every open trip, filters live by trip and group name, and marks the choice", async () => {
  const { TripPickerSheet } = await import("./TableTrip");
  mocks.query.current = { status: "ready", groups: groups() };
  const picked = TripId.make(crypto.randomUUID());

  const view = await mount(() => (
    <TripPickerSheet value={picked} onSelect={() => {}} onClose={() => {}} />
  ));

  try {
    expect(view.host.querySelector('section[aria-label="Trip"]')).not.toBeNull();
    expect(view.host.textContent).not.toContain("Save trip");
    expect(view.rows()).toContain("Personal · no trip");
    expect(view.host.textContent).toContain("Keep this table personal");
    expect(view.rows()).toEqual([
      "Personal · no trip",
      "Current trip",
      "Vegas Weekend",
      "Reno",
      "Atlantic City",
    ]);
    expect(view.row("Current trip").getAttribute("aria-selected")).toBe("true");
    expect(view.row("Vegas Weekend").getAttribute("aria-selected")).toBe("false");

    await view.type("  vegas ");
    expect(view.rows()).toEqual(["Vegas Weekend"]);

    await view.type("THURSDAY");
    expect(view.rows()).toEqual(["Vegas Weekend", "Reno"]);

    await view.type("zzz");
    expect(view.rows()).toEqual([]);
    expect(view.host.textContent).toContain("No trips match “zzz”");

    await act(async () => view.row("Clear search").click());
    expect(view.search().value).toBe("");
    expect(view.rows()).toHaveLength(5);
  } finally {
    await view.unmount();
  }
});

it("shows the row skeleton while trips load and keeps personal when they fail", async () => {
  const { TripPickerSheet } = await import("./TableTrip");
  mocks.query.current = { status: "loading", groups: [] };

  const view = await mount(() => (
    <TripPickerSheet value={null} onSelect={() => {}} onClose={() => {}} />
  ));

  try {
    expect(view.host.querySelector('[aria-label="Loading"]')).not.toBeNull();
    expect(view.rows()).toEqual([]);

    mocks.query.current = { status: "failed", groups: [] };

    const next = await mount(() => (
      <TripPickerSheet value={null} onSelect={() => {}} onClose={() => {}} />
    ));

    try {
      expect(next.host.querySelector('[aria-label="Loading"]')).toBeNull();
      expect(next.rows()).toEqual(["Personal · no trip"]);
      expect(next.host.textContent).toContain("Trips couldn't load");
    } finally {
      await next.unmount();
    }
  } finally {
    await view.unmount();
  }
});

it("selects the moment a row is tapped, blocks dismissal while it saves, and stays open on failure", async () => {
  const { TripPickerSheet } = await import("./TableTrip");
  const list = groups();
  mocks.query.current = { status: "ready", groups: list };
  const release: Slot<() => void> = { current: () => {} };
  const fail = { current: true };

  const onSelect = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        release.current = () => (fail.current ? reject(new Error("nope")) : resolve());
      }),
  );

  const view = await mount(() => (
    <TripPickerSheet value={null} onSelect={onSelect} onClose={() => {}} />
  ));

  try {
    await act(async () => view.row("Reno").click());
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(list[0]!.trips[1]!.id);
    expect(view.host.querySelector('section[aria-label="Trip"]')!.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(view.host.querySelector('[role="progressbar"]')).not.toBeNull();

    await act(async () => view.row("Atlantic City").click());
    expect(onSelect).toHaveBeenCalledOnce();

    await act(async () => release.current());
    expect(view.host.querySelector('[role="alert"]')!.textContent).toContain("Couldn't save");
    expect(view.host.querySelector('[role="progressbar"]')).toBeNull();

    fail.current = false;
    await act(async () => view.row("Personal · no trip").click());
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(null);
    await act(async () => release.current());
    expect(view.host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("saves the table's trip on the tap and returns, and shows the failure otherwise", async () => {
  const { TableTripSheet } = await import("./TableTrip");
  const list = groups();
  mocks.query.current = { status: "ready", groups: list };
  const failing = { current: false };
  const store = makeStore(failing);
  const table = await startedTable(store);
  failing.current = true;
  const saved = vi.fn();

  const view = await mount(
    () => <TableTripSheet table={table} onClose={() => {}} onSaved={saved} />,
    store,
  );

  try {
    expect(view.host.textContent).not.toContain("Save trip");
    expect(view.row("Personal · no trip").getAttribute("aria-selected")).toBe("true");

    await act(async () => view.row("Reno").click());
    expect(saved).not.toHaveBeenCalled();
    expect(view.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(store.getSnapshot().state!.tables[0]!.tripId).toBeNull();

    failing.current = false;
    await act(async () => view.row("Reno").click());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.tripId).toBe(list[0]!.trips[1]!.id);

    saved.mockClear();
    await act(async () => view.row("Personal · no trip").click());
    expect(saved).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state!.tables[0]!.tripId).toBe(list[0]!.trips[1]!.id);
  } finally {
    await view.unmount();
  }
});

it("shows the trip as a field row, and hides it signed out unless the table already has one", async () => {
  const { TripRow, useTripPickable } = await import("./TableTrip");
  const list = groups();
  const trip = list[0]!.trips[0]!.id;
  mocks.query.current = { status: "ready", groups: list };
  const press = vi.fn();

  const Probe = ({ attached }: { attached: boolean }) =>
    useTripPickable(attached) ? <TripRow value={attached ? trip : null} onPress={press} /> : null;

  const view = await mount(() => <Probe attached />);

  try {
    expect(view.host.textContent).toBe("TripThursday crew · Vegas Weekend");
    await act(async () => view.host.querySelector("button")!.click());
    expect(press).toHaveBeenCalledOnce();
  } finally {
    await view.unmount();
  }

  mocks.signedIn.current = false;
  const signedOutAttached = await mount(() => <Probe attached />);

  try {
    expect(signedOutAttached.host.textContent).toBe("TripCurrent trip");
  } finally {
    await signedOutAttached.unmount();
  }

  const signedOutPersonal = await mount(() => <Probe attached={false} />);

  try {
    expect(signedOutPersonal.host.textContent).toBe("");
    expect(mocks.mounts.current).toBe(1);
  } finally {
    await signedOutPersonal.unmount();
  }
});
