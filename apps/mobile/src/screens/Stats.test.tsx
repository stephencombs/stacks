import { makeRecordingStore } from "@stacks/client-runtime/recording";
import type { RecordingStorageDocument } from "@stacks/client-runtime/recordingStorage";
import { recordingHome } from "@stacks/client-runtime/recordingView";
import type { StatsState } from "@stacks/client-runtime/statsCopy";
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TableId,
  TripId,
  UserId,
  VenueId,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

type Account = { available: true; isLoaded: true; isSignedIn: boolean; userId: string | null };

async function load(
  account: Account,
  {
    platform = "ios",
    home = null,
    groupState,
  }: {
    platform?: "ios" | "android";
    home?: ReturnType<typeof recordingHome> | null;
    groupState?: StatsState;
  } = {},
) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const Container = ({
    children,
    className,
    testID,
  }: {
    children?: ReactNode;
    className?: string;
    testID?: string;
  }) => (
    <div className={className} data-testid={testID}>
      {children}
    </div>
  );

  const Touch = ({
    children,
    label,
    onPress,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
  }: {
    children?: ReactNode;
    label?: string;
    onPress: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { checked?: boolean };
  }) => (
    <button
      type="button"
      onClick={onPress}
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      aria-checked={accessibilityState?.checked}
    >
      {children ?? label}
    </button>
  );

  vi.doMock("react-native", () => ({
    Platform: { OS: platform },
    View: Container,
    Text: (props: Parameters<typeof Container>[0] & { onPress?: () => void }) =>
      props.onPress ? (
        <Touch onPress={props.onPress}>{props.children}</Touch>
      ) : (
        <Container {...props} />
      ),
    Pressable: Touch,
    ScrollView: (
      props: Parameters<typeof Container>[0] & {
        onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
      },
    ) => (
      <div
        data-testid={props.testID}
        onScroll={() => props.onScroll?.({ nativeEvent: { contentOffset: { y: 12 } } })}
      >
        {props.children}
      </div>
    ),
    PanResponder: { create: () => ({ panHandlers: {} }) },
  }));
  vi.doMock("react-native-svg", () => ({
    default: Container,
    Circle: Container,
    ClipPath: Container,
    Defs: Container,
    Line: Container,
    Path: Container,
    Polyline: Container,
    Rect: Container,
    Text: Container,
  }));
  vi.doMock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 24, left: 0, right: 0 }),
  }));
  vi.doMock("uniwind", () => ({ useCSSVariable: () => [] }));
  vi.doMock("@stacks/client-runtime/recordingReact", () => ({
    useRecordingHome: () => ({
      home,
      status: home ? "saved" : "loading",
      error: null,
      retryLoad: () => {},
    }),
  }));
  const navigation = { navigate: vi.fn(), setOptions: vi.fn() };
  vi.doMock("@react-navigation/native", () => ({
    useIsFocused: () => true,
    useNavigation: () => navigation,
  }));
  vi.doMock("@react-navigation/elements", () => ({ useHeaderHeight: () => 106 }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/Money", () => ({ Money: () => null }));
  vi.doMock("../components/ui/Button", () => ({ Button: Touch }));
  vi.doMock("../components/ui/FilterChip", () => ({ FilterChip: () => null }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: Container,
    List: Container,
    SectionHeading: Container,
    Row: (props: Parameters<typeof Container>[0] & { onPress?: () => void }) =>
      props.onPress ? (
        <Touch onPress={props.onPress}>{props.children}</Touch>
      ) : (
        <Container {...props} />
      ),
    Skeleton: () => <span>Loading your play</span>,
  }));
  vi.doMock("../features/Race", () => ({ Race: () => null }));
  vi.doMock("../features/Chip", () => ({ Chip: () => null }));
  vi.doMock("../lib/go", () => ({ useGo: () => ({ trip: vi.fn(), group: vi.fn() }) }));
  vi.doMock("../features/GroupStats", async () => {
    if (groupState) return vi.importActual("../features/GroupStats");

    const { useStacks } = await vi.importActual<typeof import("@stacks/client-runtime/react")>(
      "@stacks/client-runtime/react",
    );

    return {
      GroupStatsView: () => {
        useStacks();

        return <span>Group stats</span>;
      },
    };
  });
  vi.doMock("../features/Personal", () => ({
    PersonalScreen: ({ children }: { children: ReactNode }) => <main>{children}</main>,
    SaveStatus: () => null,
    PersonalYouButton: () => <button type="button" aria-label="You" />,
  }));
  vi.doMock("../features/RecordingForms", () => ({ PastSessionSheet: () => null }));
  vi.doMock("../features/FeltStatusBar", () => ({ FeltStatusBar: () => null }));
  vi.doMock("../features/LiveBar", () => ({ PersonalLiveBar: () => null }));
  vi.doMock("../components/ui/tabBar", () => ({ useScreenFoot: () => ({ endSpace: 0 }) }));
  vi.doMock("../components/ui/Sheet", () => ({
    SheetHost: Container,
    Sheet: ({
      title,
      footer,
      children,
      onClose,
    }: {
      title: string;
      footer?: ReactNode;
      children?: ReactNode;
      onClose: () => void;
    }) => (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
        <Touch label="Close" onPress={onClose} />
      </div>
    ),
  }));
  vi.doMock("../features/StatsMenus.android", () => ({
    StatsMenu: ({
      options,
      value,
      onChange,
      menuState,
    }: {
      options: ReadonlyArray<{ value: string; label: string }>;
      value: string;
      onChange: (value: string) => void;
      menuState?: { open: boolean; setOpen: (open: boolean) => void };
    }) => {
      const [localOpen, setLocalOpen] = useState(false);
      const open = menuState?.open ?? localOpen;
      const setOpen = menuState?.setOpen ?? setLocalOpen;

      return (
        <>
          <Touch
            label={options.find((option) => option.value === value)?.label}
            onPress={() => setOpen(true)}
          />
          {open ? (
            <div role="menu">
              {options.map((option) => (
                <Touch
                  key={option.value}
                  label={option.label}
                  onPress={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                />
              ))}
            </div>
          ) : null}
        </>
      );
    },
    StatsChipTrigger: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Touch label={label} onPress={onPress} />
    ),
    StatsRadio: () => null,
  }));
  vi.doMock("../lib/account", () => ({ useAccount: () => account }));
  vi.doMock("../lib/stacks", async () => {
    const { StacksContext, useStacks } = await vi.importActual<
      typeof import("@stacks/client-runtime/react")
    >("@stacks/client-runtime/react");

    const stacks = { groups: (await import("effect/reactivity/Atom")).make([]) };

    return {
      StacksProvider: ({ children }: { children: ReactNode }) => (
        // SAFETY: this screen only reads stacks.groups; the other Stacks fields stay unused in this test.
        <StacksContext value={stacks as never}>{children}</StacksContext>
      ),
      useStacks,
      useStatsCopies: () => null,
      useGroupStats: () => groupState,
    };
  });
  const { StatsScreen } = await import("./Stats");
  const element = document.createElement("div");
  const errors: unknown[] = [];
  const root = createRoot(element, { onUncaughtError: (error) => errors.push(error) });

  return { StatsScreen, element, errors, navigation, root };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

const groupId = "5f0e2c0e-6f43-4a44-9d0a-4f8f4bb0a001";
const route = { params: { groupId } };

it("opens on a group's stats when signed in with that group picked", async () => {
  const { StatsScreen, element, errors, root } = await load({
    available: true,
    isLoaded: true,
    isSignedIn: true,
    userId: "user-1",
  });

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  expect(element.textContent).toBe("Group stats");
  await act(async () => root.unmount());
});

it("falls back to Just me when signed out, even with a group picked in the address", async () => {
  const { StatsScreen, element, errors, root } = await load({
    available: true,
    isLoaded: true,
    isSignedIn: false,
    userId: null,
  });

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  expect(element.textContent).toContain("Loading your play");
  expect(element.textContent).not.toContain("Group stats");
  await act(async () => root.unmount());
});

const signedOut: Account = {
  available: true,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
};

const vegas = TripId.make("0192e7a0-0000-7000-8000-0000000000e1");
const casinoId = VenueId.make("0192e7a0-0000-7000-8000-0000000000e2");

async function withFinishedSessions() {
  let saved: RecordingStorageDocument = { revision: 0 };

  const store = makeRecordingStore({
    load: async () => saved,
    commit: async (revision, payload) => {
      saved = { revision: revision + 1, payload };

      return saved.revision;
    },
    subscribe: () => () => undefined,
    close: async () => undefined,
  });

  await store.ready;
  await store.transform((current) => ({
    ...current,
    venues: [
      {
        id: casinoId,
        name: "Casino",
        kind: "casino",
        city: null,
        region: null,
        country: null,
        lat: null,
        lng: null,
      },
    ],
  }));
  const start = DateTime.makeUnsafe("2025-03-01T18:00:00.000Z");

  for (let day = 0; day < 5; day++) {
    const startedAt = DateTime.add(start, { days: day });
    await store.execute(
      store.prepare({
        type: "record_completed",
        game: day === 4 ? "baccarat" : "blackjack",
        ...(day < 4 ? { venueId: casinoId } : null),
        buyIn: 10000,
        cashOut: 13000,
        startedAt,
        finishedAt: DateTime.add(startedAt, { hours: 2 }),
      }),
    );
  }

  const home = recordingHome(store.getSnapshot().state!);

  return {
    ...home,
    finished: home.finished.map((item) => ({ ...item, table: { ...item.table, tripId: vegas } })),
  };
}

function button(parent: ParentNode, text: string) {
  const found = [...parent.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );

  if (!found) throw new Error(`Missing button: ${text}`);

  return found;
}

it("keeps You beside the Android filters and fills the bar on scroll", async () => {
  const { StatsScreen, element, errors, navigation, root } = await load(signedOut, {
    platform: "android",
  });

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  expect(navigation.setOptions).toHaveBeenCalledWith({ headerShown: false });
  const bar = element.querySelector('[data-testid="stats-filter-bar"]')!;
  const body = element.querySelector('[data-testid="stats-content"]')!;
  expect(bar.querySelector('[aria-label="You"]')).not.toBeNull();
  expect(body.querySelector('[aria-label="You"]')).toBeNull();
  expect(bar.className).toContain("bg-canvas");
  await act(async () => body.dispatchEvent(new Event("scroll")));
  expect(bar.className).toContain("bg-surface");
  await act(async () => root.unmount());
});

it("confirms an Android trip only when the radio sheet's action is pressed", async () => {
  const { StatsScreen, element, errors, root } = await load(signedOut, {
    platform: "android",
    home: await withFinishedSessions(),
  });

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  await act(async () => button(element, "All trips").click());
  const sheet = element.querySelector('[role="dialog"]')!;
  await act(async () => button(sheet, "Group trip").click());
  expect(button(sheet, "Group trip").getAttribute("aria-checked")).toBe("true");
  expect(element.textContent).toContain("Result · all time");
  await act(async () => button(sheet, "Show 5 sessions").click());
  expect(element.querySelector('[role="dialog"]')).toBeNull();
  expect(element.textContent).toContain("Result · Group trip");
  expect(element.textContent).not.toContain("All time");
  await act(async () => root.unmount());
});

it("opens and dismisses the personal running-result reading", async () => {
  const { StatsScreen, element, errors, root } = await load(signedOut, {
    platform: "android",
    home: await withFinishedSessions(),
  });

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  await act(async () => button(element, "Drag to inspect").click());
  expect(element.textContent).toContain("That session");
  await act(async () => button(element, "Done").click());
  expect(element.textContent).not.toContain("That session");
  await act(async () => root.unmount());
});

it("opens the game menu from no match and keeps the casino when choosing another game", async () => {
  const { StatsScreen, element, errors, root } = await load(signedOut, {
    platform: "android",
    home: await withFinishedSessions(),
  });

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  await act(async () => button(element, "Casino").click());
  await act(async () => button(element, "All games").click());
  await act(async () => button(element.querySelector('[role="menu"]')!, "Baccarat").click());
  expect(element.textContent).toContain("No matching sessions");
  await act(async () => button(element, "Change game").click());
  await act(async () => button(element.querySelector('[role="menu"]')!, "Blackjack").click());
  expect(element.textContent).not.toContain("No matching sessions");
  expect(element.textContent).not.toContain("BY CASINO");
  await act(async () => root.unmount());
});

it("shows saved group stats and opens a member's result sheet", async () => {
  const startedAt = DateTime.makeUnsafe("2026-11-12T20:00:00.000Z");
  const endedAt = DateTime.add(startedAt, { hours: 3 });
  const you = PlayerId.make("0192e7a0-0000-7000-8000-0000000000f1");

  const { StatsScreen, element, errors, root } = await load(
    { ...signedOut, isSignedIn: true, userId: "user-1" },
    {
      platform: "android",
      groupState: {
        kind: "saved",
        copy: {
          fetchedAt: endedAt,
          detail: {
            group: {
              id: GroupId.make(groupId),
              name: "Thursday crew",
              currency: CurrencyCode.make("USD"),
              createdAt: startedAt,
            },
            players: [
              {
                id: you,
                displayName: "Maya",
                role: "owner",
                userId: UserId.make("user-1"),
                claimCode: null,
              },
            ],
            myPlayerId: you,
            role: "owner",
            trips: [],
          },
          stats: {
            venues: [],
            plays: [
              {
                id: TableId.make("0192e7a0-0000-7000-8000-0000000000a1"),
                tripId: vegas,
                game: "blackjack",
                venueId: null,
                startedAt,
                endedAt,
                results: [
                  {
                    playerId: you,
                    net: MinorUnits.make(1400),
                    buyIn: MinorUnits.make(10000),
                    milliseconds: 10800000,
                  },
                ],
              },
            ],
          },
        },
      },
    },
  );

  await act(async () => root.render(<StatsScreen route={route} />));
  expect(errors).toEqual([]);
  expect(element.textContent).toContain("Offline · Showing saved stats");
  expect(element.textContent).toContain("Only sessions recorded in this group.");
  await act(async () => button(element, "Maya").click());
  const sheet = element.querySelector('[role="dialog"][aria-label="Maya"]')!;
  expect(sheet.textContent).toContain("Best session");
  expect(sheet.textContent).toContain("1st of 1 player");
  await act(async () => root.unmount());
});
