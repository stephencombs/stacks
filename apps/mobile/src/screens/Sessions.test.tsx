import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TripId,
  UserId,
  TableId,
  VisitId,
  type GroupDetail,
  type TripDetail,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

it("starts from a trip in Play with that trip preselected, then opens the new visit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const day = DateTime.makeUnsafe("2026-11-15T12:00:00Z");
  const groupId = GroupId.make(crypto.randomUUID());
  const tripId = TripId.make(crypto.randomUUID());

  let trip: TripDetail = {
    trip: {
      id: tripId,
      groupId,
      name: "Vegas",
      startedAt: day,
      endedAt: null,
      createdAt: day,
      createdBy: UserId.make("alex"),
    },
    sessions: [],
    tables: [],
    balances: [],
    stakes: [],
  };

  let group: GroupDetail = {
    group: { id: groupId, name: "Crew", currency: CurrencyCode.make("USD"), createdAt: day },
    role: "owner",
    myPlayerId: PlayerId.make(crypto.randomUUID()),
    players: [],
    trips: [trip.trip],
  };

  const navigate = vi.fn();
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  vi.doMock("@react-navigation/native", () => ({
    useIsFocused: () => true,
    useNavigation: () => ({ navigate }),
  }));
  vi.doMock("react-native", () => ({ View: Container, Text: Container, Platform: { OS: "ios" } }));
  vi.doMock("../lib/go", () => ({ useGo: () => ({ stats: vi.fn() }) }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../lib/scope", () => ({
    usePlaceAddress: () => {},
    ScopeLoaded: ({ children }: { children: (scope: { trip: TripDetail["trip"] }) => ReactNode }) =>
      children({ trip: trip.trip }),
  }));
  vi.doMock("../lib/stacks", () => ({
    TripLoaded: ({ children }: { children: (trip: TripDetail, group: GroupDetail) => ReactNode }) =>
      children(trip, group),
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  }));
  vi.doMock("../components/ui/Screen", () => ({
    Screen: ({
      children,
      renderFooter,
    }: {
      children?: ReactNode;
      renderFooter?: () => ReactNode;
    }) => (
      <main>
        {children}
        <footer>{renderFooter?.()}</footer>
      </main>
    ),
    screenError: () => null,
  }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: Container,
    PageTitle: Container,
    SectionHeading: Container,
  }));
  vi.doMock("../features/ScreenSkeletons", () => ({ SessionsSkeleton: () => null }));
  vi.doMock("../features/TripHero", () => ({ TripHero: () => null }));
  vi.doMock("../features/TripOptions", () => ({
    ReopenTrip: () => null,
    TripOptionsButton: () => null,
  }));
  vi.doMock("../features/SessionList", () => ({ SessionList: () => null }));
  const visitId = VisitId.make(crypto.randomUUID());
  const tableId = TableId.make(crypto.randomUUID());
  vi.doMock("../features/RecordingForms", () => ({
    StartSheet: ({
      initialTripId,
      onStarted,
      onOpened,
      onClose,
    }: {
      initialTripId: TripId;
      onStarted: (id: VisitId) => void;
      onOpened?: (id: TableId) => void;
      onClose: () => void;
    }) => (
      <div role="dialog" data-trip={initialTripId}>
        <button onClick={() => onStarted(visitId)}>Record</button>
        {onOpened ? <button onClick={() => onOpened(tableId)}>Record a table</button> : null}
        <button onClick={onClose}>Cancel</button>
      </div>
    ),
  }));
  const { SessionsScreen } = await import("./Sessions");
  const host = document.createElement("div");
  const root = createRoot(host);

  try {
    await act(async () => root.render(<SessionsScreen route={{ params: { tripId } }} />));

    const start = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Start a session",
    );

    expect(start).toBeDefined();
    await act(async () => start!.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("data-trip")).toBe(tripId);
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!.click(),
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => start!.click());
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Record")!.click(),
    );
    expect(navigate).toHaveBeenCalledWith("Play", { visitId });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => start!.click());
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Record a table")!.click(),
    );
    expect(navigate).toHaveBeenCalledWith("Table", { tableId });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const usdGroup = group;

    for (const currency of ["EUR", "JPY"]) {
      group = { ...usdGroup, group: { ...usdGroup.group, currency: CurrencyCode.make(currency) } };
      await act(async () => root.render(<SessionsScreen route={{ params: { tripId } }} />));
      expect(host.textContent).not.toContain("Start a session");
    }

    group = usdGroup;
    trip = { ...trip, trip: { ...trip.trip, endedAt: day } };
    await act(async () => root.render(<SessionsScreen route={{ params: { tripId } }} />));
    expect(host.textContent).not.toContain("Start a session");
    trip = {
      ...trip,
      trip: { ...trip.trip, endedAt: null },
      tables: [
        {
          table: {
            id: TableId.make(crypto.randomUUID()),
            tripId,
            game: "poker_cash",
            venueId: null,
            highLimit: false,
            starterPlayerId: group.myPlayerId,
          },
          venue: null,
          startedAt: day,
          endedAt: null,
          minutesPlayed: 0,
          playerIds: [group.myPlayerId],
          playing: [group.myPlayerId],
          results: [],
          inPlay: [{ playerId: group.myPlayerId, buyIn: MinorUnits.make(100_00) }],
          others: [],
          myVisitId: visitId,
        },
      ],
    };
    await act(async () => root.render(<SessionsScreen route={{ params: { tripId } }} />));
    expect(host.textContent).not.toContain("Nothing finished on this trip yet");
  } finally {
    await act(async () => root.unmount());
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
