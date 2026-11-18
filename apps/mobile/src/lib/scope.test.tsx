// @vitest-environment happy-dom
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TripId,
  UserId,
  type GroupListItem,
  type Trip,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import { act, createElement, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const day = DateTime.makeUnsafe(Date.UTC(2026, 10, 1));
const crewId = GroupId.make("0192e7a0-0000-7000-8000-000000000001");
const trip = (id: string, name: string): Trip => ({
  id: TripId.make(id),
  groupId: crewId,
  name,
  startedAt: day,
  endedAt: null,
  createdBy: UserId.make("0192e7a0-0000-7000-8000-000000000009"),
  createdAt: day,
});
const vegas = trip("0192e7a0-0000-7000-8000-000000000002", "Vegas");
const reno = trip("0192e7a0-0000-7000-8000-000000000003", "Reno");
const crew = (trips: ReadonlyArray<Trip>): GroupListItem => ({
  group: { id: crewId, name: "Crew", currency: CurrencyCode.make("USD"), createdAt: day },
  role: "owner",
  myPlayerId: PlayerId.make("0192e7a0-0000-7000-8000-000000000008"),
  myBalance: MinorUnits.make(0),
  liveSessionCount: 0,
  liveTripIds: [],
  currentTripId: null,
  trips,
  mySession: null,
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("keeps a just-started trip in scope while the groups list catches up", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let groups = AsyncResult.success([crew([vegas])]);
  let lastTripId: TripId | null = vegas.id;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => lastTripId,
    set: (id: TripId | null) => {
      lastTripId = id;
      notify();
    },
  };
  let setParams: (params: { tripId?: string }) => void = () => {};
  vi.doMock("@react-navigation/native", () => ({
    CommonActions: { setParams: (params: { tripId?: string }) => params },
    useNavigation: () => ({ dispatch: (params: { tripId?: string }) => setParams(params) }),
  }));
  vi.doMock("@effect/atom-react", async () => {
    const { useSyncExternalStore } = await import("react");
    return { useAtomValue: () => useSyncExternalStore(store.subscribe, () => groups) };
  });
  vi.doMock("./stacks", async () => {
    const { useSyncExternalStore } = await import("react");
    return {
      Loaded: () => null,
      useStacks: () => ({ groups: null }),
      useLastTrip: () => ({
        lastTripId: useSyncExternalStore(store.subscribe, store.get),
        setLastTripId: store.set,
      }),
    };
  });
  const { ScopeProvider, usePlaceAddress, useScope } = await import("./scope");

  let start: (id: TripId) => void = () => {};
  function Sessions() {
    const [params, set] = useState<{ tripId?: string }>({ tripId: vegas.id });
    usePlaceAddress(params, "tripId");
    const { setTrip } = useScope();
    useLayoutEffect(() => {
      setParams = (next) => set((current) => ({ ...current, ...next }));
      start = (id) => {
        setTrip(id);
        set({});
      };
    }, [setTrip]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(ScopeProvider, null, createElement(Sessions))));

  await act(async () => start(reno.id));
  expect(lastTripId).toBe(reno.id);

  groups = AsyncResult.success([crew([reno, vegas])]);
  await act(async () => notify());
  expect(lastTripId).toBe(reno.id);
  await act(async () => root.unmount());
});

it("opens a trip just started in a second group, not another group's trip", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const workId = GroupId.make("0192e7a0-0000-7000-8000-000000000004");
  const work: GroupListItem = {
    ...crew([]),
    group: { id: workId, name: "Work", currency: CurrencyCode.make("USD"), createdAt: day },
  };
  const tahoe: Trip = { ...trip("0192e7a0-0000-7000-8000-000000000005", "Tahoe"), groupId: workId };
  let groups = AsyncResult.success([crew([vegas]), work]);
  let lastTripId: TripId | null = vegas.id;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => lastTripId,
    set: (id: TripId | null) => {
      lastTripId = id;
      notify();
    },
  };
  vi.doMock("@react-navigation/native", () => ({
    CommonActions: { setParams: (params: object) => params },
    useNavigation: () => ({ dispatch: () => {} }),
  }));
  vi.doMock("@effect/atom-react", async () => {
    const { useSyncExternalStore } = await import("react");
    return { useAtomValue: () => useSyncExternalStore(store.subscribe, () => groups) };
  });
  vi.doMock("./stacks", async () => {
    const { useSyncExternalStore } = await import("react");
    return {
      Loaded: () => null,
      useStacks: () => ({ groups: null }),
      useLastTrip: () => ({
        lastTripId: useSyncExternalStore(store.subscribe, store.get),
        setLastTripId: store.set,
      }),
    };
  });
  const { ScopeProvider, useScope } = await import("./scope");

  let current: ReturnType<typeof useScope> | undefined;
  function Probe() {
    const scope = useScope();
    useLayoutEffect(() => {
      current = scope;
    }, [scope]);
    return null;
  }
  const shown = () => ({ group: current?.scope?.item.group.id, trip: current?.scope?.trip?.id });
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(ScopeProvider, null, createElement(Probe))));
  expect(shown()).toEqual({ group: crewId, trip: vegas.id });

  // The groups list still says Work has no trips.
  await act(async () => current!.startTrip(tahoe));
  expect(shown()).toEqual({ group: workId, trip: tahoe.id });

  groups = AsyncResult.success([crew([vegas]), { ...work, trips: [tahoe] }]);
  await act(async () => notify());
  expect(shown()).toEqual({ group: workId, trip: tahoe.id });

  groups = AsyncResult.success([crew([vegas]), work]);
  await act(async () => current!.forgetTrip(workId, tahoe.id));
  expect(shown()).toEqual({ group: workId, trip: undefined });
  await act(async () => root.unmount());
});
