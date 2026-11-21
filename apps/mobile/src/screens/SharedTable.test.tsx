import { Conflict, MinorUnits, PlayerId, TableId, VisitId } from "@stacks/contracts";
import type { TableView } from "@stacks/contracts/recordingCommands";
import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

it("lets a viewer join a shared table, buy in with returning=false, and replace into Play", async () => {
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

  const tableId = TableId.make(crypto.randomUUID());
  const starterId = PlayerId.make(crypto.randomUUID());
  const starterVisitId = VisitId.make(crypto.randomUUID());
  const samId = PlayerId.make(crypto.randomUUID());
  const startedAt = DateTime.makeUnsafe("2026-11-15T19:00:00Z");

  const sharedView: TableView = {
    table: {
      id: tableId,
      tripId: null,
      game: "poker_cash",
      venueId: null,
      highLimit: false,
      starterPlayerId: starterId,
    },
    players: [{ id: starterId, displayName: "Alex" }],
    visits: [
      {
        visit: {
          id: starterVisitId,
          playerId: starterId,
          tableId,
          startedAt,
          finishedAt: null,
          revision: 1,
        },
        totals: {
          buyIn: MinorUnits.make(20000),
          cashOut: MinorUnits.make(0),
          adjustment: MinorUnits.make(0),
        },
        finalResult: null,
      },
    ],
    viewerRole: "viewer",
    viewerPlayerId: null,
    recorders: [starterId],
    appointable: [],
    shared: true,
  };

  const navigate = vi.fn();
  const dispatch = vi.fn();
  let failSharedLoad = false;

  const joinMock = vi.fn(async (displayName: string) => {
    const joined = {
      table: {
        ...sharedView.table,
        starterPlayerId: sharedView.table.starterPlayerId ?? starterId,
      },
      player: { id: samId, displayName },
    };

    await store.transform((current) => ({
      ...current,
      ownedPlayerIds: [...new Set([...(current.ownedPlayerIds ?? []), joined.player.id])],
      players: [...current.players, joined.player],
      participants: [
        ...current.participants,
        { tableId: joined.table.id, playerId: joined.player.id },
      ],
      tables: [...current.tables, joined.table],
    }));

    return joined;
  });

  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  const Button = ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  );

  vi.doMock("@react-navigation/native", () => ({
    useNavigation: () => ({ navigate, dispatch }),
    StackActions: {
      replace: (
        screen: string,
        params: { readonly visitId?: string; readonly tableId?: string },
      ) => ({ type: "REPLACE", screen, params }),
    },
  }));
  vi.doMock("react-native", () => ({
    Platform: { OS: "ios" },
    Pressable: Container,
    Switch: () => null,
    Text: Container,
    View: Container,
  }));
  vi.doMock("../lib/config", () => ({ apiUrl: "https://api.example.com" }));
  vi.doMock("../lib/recording", () => ({
    useRecordingState: () => useSyncExternalStore(store.subscribe, store.getSnapshot).state,
  }));
  vi.doMock("@stacks/client-runtime/api", () => ({
    fetchSharedTable: () =>
      failSharedLoad ? Effect.fail(new Error("gone")) : Effect.succeed(sharedView),
    fetchInvitePreview: () => Effect.fail(new Error("unused")),
  }));
  vi.doMock("@stacks/client-runtime/recordingReact", async () => {
    const actual = await vi.importActual<typeof import("@stacks/client-runtime/recordingReact")>(
      "@stacks/client-runtime/recordingReact",
    );

    return {
      ...actual,
      useJoinTable: () => ({ pending: false, error: null, join: joinMock }),
    };
  });
  vi.doMock("../components/ui/Button", () => ({ Button }));
  vi.doMock("../components/ui/Field", () => ({
    Choice: () => null,
    FormError: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    TextField: ({
      label,
      value,
      error,
      onChangeText,
    }: {
      label: string;
      value: string;
      error?: string | null;
      onChangeText: (value: string) => void;
    }) => (
      <label>
        <span>{label}</span>
        <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
        {error ? <span role="alert">{error}</span> : null}
      </label>
    ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    SheetHost: Container,
    Sheet: ({
      title,
      description,
      footer,
      children,
    }: {
      title: string;
      description?: string;
      footer?: ReactNode;
      children?: ReactNode;
    }) => (
      <section aria-label={title}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
        <div>{footer}</div>
      </section>
    ),
  }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: ({ title, children }: { title: string; children?: ReactNode }) => (
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    ),
    List: Container,
    PageTitle: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
    Row: Container,
    SectionHeading: Container,
    Skeleton: () => <div>loading</div>,
    Tag: Container,
  }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/ui/DateTimeField", () => ({ DateTimeField: () => null }));
  vi.doMock("../features/Chip", () => ({ Chip: () => null }));
  vi.doMock("../components/ui/GlassSurface", () => ({ GlassSurface: Container }));
  vi.doMock("../components/Money", () => ({
    Money: ({ amount }: { amount: number }) => <span>${amount / 100}</span>,
  }));
  vi.doMock("../features/Personal", () => ({
    PersonalScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
  }));
  vi.doMock("../features/AmountKeypad", () => ({
    AmountKeypad: ({ onKey }: { onKey: (key: string) => void }) => (
      <div>
        {["2", "0"].map((digit) => (
          <button key={digit} type="button" onClick={() => onKey(digit)}>
            key:{digit}
          </button>
        ))}
      </div>
    ),
  }));
  vi.doMock("../features/VenuePicker", () => ({ SessionVenuePicker: () => null }));
  vi.doMock("../features/TableTrip", () => ({ TripChoice: () => null }));

  const { RecordingProvider } = await import("@stacks/client-runtime/recordingReact");
  const { SharedTableScreen } = await import("./SharedTable");
  const element = document.createElement("div");
  const root = createRoot(element);

  const clickButton = async (label: string, scope: ParentNode = element) => {
    const button = [...scope.querySelectorAll("button")].find((b) => b.textContent === label);
    expect(button, label).toBeDefined();
    await act(async () => {
      button!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  try {
    await act(async () => {
      root.render(
        <RecordingProvider store={store}>
          <SharedTableScreen route={{ params: { token: "share-tok" } }} />
        </RecordingProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(element.textContent).toContain("Alex");
    await clickButton("Join this table");
    expect(element.querySelector('section[aria-label="Join this table"]')).not.toBeNull();

    await clickButton("Join as a new player");
    expect(element.textContent).toContain("Enter your name.");
    expect(joinMock).not.toHaveBeenCalled();

    const input = element.querySelector<HTMLInputElement>('input[aria-label="Your name"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "  Sam  ");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton("Join as a new player");
    expect(joinMock).toHaveBeenCalledWith("Sam");

    const sitSheet = element.querySelector('section[aria-label="Buy in"]');
    expect(sitSheet).not.toBeNull();
    expect(sitSheet!.textContent).toContain("Your buy-in as Sam.");
    expect(sitSheet!.textContent).not.toContain("Back at the table");

    await clickButton("key:2", sitSheet!);
    await clickButton("key:0", sitSheet!);
    await clickButton("key:0", sitSheet!);
    await clickButton("Buy in", sitSheet!);

    await vi.waitFor(() => {
      const samVisits = store.getSnapshot().state!.visits.filter((v) => v.playerId === samId);
      expect(samVisits).toHaveLength(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: "REPLACE",
        screen: "Play",
        params: { visitId: samVisits[0]!.id },
      });
    });

    failSharedLoad = true;
    await act(async () => {
      root.render(
        <RecordingProvider store={store}>
          <SharedTableScreen route={{ params: { token: "revoked-tok" } }} />
        </RecordingProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(element.textContent).toContain("This link doesn't work anymore");
    await clickButton("Open Color Up");
    expect(navigate).toHaveBeenCalledWith("Tabs", {
      screen: "PlayTab",
      params: { screen: "Home" },
    });
  } finally {
    await act(async () => root.unmount());
    await store.close();
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});

it("redeems a player invite to Home and shows Conflict errors clearly", async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const navigate = vi.fn();
  const redeemMock = vi.fn(async () => true);
  let mode: "ok" | "conflict" = "ok";

  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  const Button = ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress}>{label}</button>
  );

  vi.doMock("@react-navigation/native", () => ({
    useNavigation: () => ({ navigate }),
  }));
  vi.doMock("react-native", () => ({
    Text: Container,
    View: Container,
    Platform: { OS: "ios" },
  }));
  vi.doMock("../lib/config", () => ({ apiUrl: "https://api.example.com" }));
  vi.doMock("@stacks/client-runtime/api", () => ({
    fetchSharedTable: () => Effect.fail(new Error("unused")),
    fetchInvitePreview: () =>
      mode === "ok"
        ? Effect.succeed({
            player: { id: PlayerId.make(crypto.randomUUID()), displayName: "Pat" },
            invitedBy: "Alex",
          })
        : Effect.fail(new Conflict({ reason: "invite_used_up" })),
  }));
  vi.doMock("@stacks/client-runtime/recordingReact", () => ({
    useRedeemInvite: () => ({ pending: false, error: null, redeem: redeemMock }),
  }));
  vi.doMock("../components/ui/Button", () => ({ Button }));
  vi.doMock("../components/ui/Field", () => ({ FormError: Container }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: ({ title, children }: { title: string; children?: ReactNode }) => (
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    ),
    Skeleton: () => <div>loading</div>,
  }));
  vi.doMock("../features/Personal", () => ({
    PersonalScreen: ({ children }: { children?: ReactNode }) => <main>{children}</main>,
  }));

  const { RedeemInviteScreen } = await import("./RedeemInvite");
  const element = document.createElement("div");
  const root = createRoot(element);

  try {
    await act(async () => {
      root.render(<RedeemInviteScreen route={{ params: { token: "inv-ok" } }} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(element.textContent).toContain("Record as Pat");
    expect(element.textContent).toContain(
      "Alex invited you to record your own play at their table.",
    );

    const redeemButton = [...element.querySelectorAll("button")].find(
      (b) => b.textContent === "I'm Pat",
    );

    expect(redeemButton).toBeDefined();
    await act(async () => {
      redeemButton!.click();
      await Promise.resolve();
    });
    expect(redeemMock).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("Tabs", {
      screen: "PlayTab",
      params: { screen: "Home" },
    });

    mode = "conflict";
    await act(async () => {
      root.render(<RedeemInviteScreen route={{ params: { token: "inv-used" } }} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(element.textContent).toContain("This invite can't be used");
    expect(element.textContent).toContain("This invite has been used up. Ask for a new one.");
  } finally {
    await act(async () => root.unmount());
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
