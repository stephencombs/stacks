// @vitest-environment happy-dom
import {
  CurrencyCode,
  GroupId,
  PlayerId,
  TripId,
  UserId,
  VisitId,
  type GroupDetail,
  type TripDetail,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, lazy, type ComponentType, type ReactNode } from "react";
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
  let Page: ComponentType = () => null;
  const loads: Array<Promise<unknown>> = [];
  vi.doMock("@tanstack/react-router", () => ({
    createFileRoute:
      () =>
      ({ component }: { component: ComponentType }) => {
        Page = component;
        return { useParams: () => ({ tripId }) };
      },
    useNavigate: () => navigate,
    lazyRouteComponent: (load: () => Promise<Record<string, ComponentType>>, name: string) => {
      const loaded = load();
      loads.push(loaded);
      return lazy(async () => ({ default: (await loaded)[name]! }));
    },
  }));
  vi.doMock("~/lib/stacks", () => ({
    TripLoaded: ({ children }: { children: (trip: TripDetail, group: GroupDetail) => ReactNode }) =>
      children(trip, group),
  }));
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  vi.doMock("~/components/ui/Button", () => ({
    Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
      <button onClick={onClick}>{children}</button>
    ),
    ButtonLink: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  }));
  vi.doMock("~/components/ui/ActionBar", () => ({ ActionBar: Container }));
  vi.doMock("~/features/TripHeader", () => ({
    TripHeader: ({ action }: { action: ReactNode }) => action,
  }));
  vi.doMock("~/features/TripRail", () => ({ TripLayout: Container, TripRail: () => null }));
  vi.doMock("~/features/TripHero", () => ({ TripHero: () => null }));
  vi.doMock("~/features/SessionList", () => ({
    LiveSessionCard: () => null,
    SessionList: () => null,
  }));
  vi.doMock("~/features/Backing", () => ({ BackingSection: () => null }));
  const visitId = VisitId.make(crypto.randomUUID());
  vi.doMock("~/features/RecordingForms", () => ({
    StartDialog: ({
      initialTripId,
      onStarted,
      onClose,
    }: {
      initialTripId: TripId;
      onStarted: (id: VisitId) => void;
      onClose: () => void;
    }) => (
      <div role="dialog" data-trip={initialTripId}>
        <button onClick={() => onStarted(visitId)}>Record</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ),
  }));
  await import("~/routes/trips/$tripId/index");
  await Promise.all(loads);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Page />));
    const start = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Start a session"),
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
    expect(navigate).toHaveBeenCalledWith({ to: "/play/$visitId", params: { visitId } });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    const usdGroup = group;
    for (const currency of ["EUR", "JPY"]) {
      group = { ...usdGroup, group: { ...usdGroup.group, currency: CurrencyCode.make(currency) } };
      await act(async () => root.render(<Page />));
      expect(host.textContent).not.toContain("Start a session");
    }
    group = usdGroup;
    trip = { ...trip, trip: { ...trip.trip, endedAt: day } };
    await act(async () => root.render(<Page />));
    expect(host.textContent).not.toContain("Start a session");
  } finally {
    await act(async () => root.unmount());
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
