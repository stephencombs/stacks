// @vitest-environment happy-dom
import {
  CurrencyCode,
  GroupId,
  MinorUnits,
  PlayerId,
  TableId,
  TripId,
  UserId,
  type GroupDetail,
} from "@stacks/contracts";
import type { TripPlay } from "@stacks/client-runtime/trip";
import * as DateTime from "effect/DateTime";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

it("opens a read-only summary dialog for a table the viewer did not play", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const start = DateTime.makeUnsafe("2026-11-15T20:00:00Z");
  const end = DateTime.makeUnsafe("2026-11-15T22:30:00Z");
  const groupId = GroupId.make(crypto.randomUUID());
  const tripId = TripId.make(crypto.randomUUID());
  const me = PlayerId.make(crypto.randomUUID());
  const gus = PlayerId.make(crypto.randomUUID());
  const detail: GroupDetail = {
    group: { id: groupId, name: "Crew", currency: CurrencyCode.make("USD"), createdAt: start },
    role: "member",
    myPlayerId: me,
    players: [
      {
        id: me,
        userId: UserId.make("alex"),
        role: "member",
        displayName: "Alex",
        claimCode: null,
      },
      {
        id: gus,
        userId: UserId.make("gus"),
        role: "member",
        displayName: "Gus",
        claimCode: null,
      },
    ],
    trips: [],
  };
  const play: TripPlay = {
    kind: "table",
    live: false,
    session: { id: TableId.make(crypto.randomUUID()), startedAt: start, highLimit: false },
    table: {
      id: TableId.make(crypto.randomUUID()),
      tripId,
      game: "poker_cash",
      venueId: null,
      highLimit: false,
      starterPlayerId: gus,
    },
    venue: {
      id: crypto.randomUUID() as never,
      name: "Bellagio",
      kind: "casino",
      city: "Las Vegas",
      region: "NV",
      country: "US",
      lat: null,
      lng: null,
      verified: true,
      groupId: null,
    },
    startedAt: start,
    endedAt: end,
    minutesPlayed: 150,
    playerIds: [gus],
    playing: [],
    results: [
      {
        playerId: gus,
        buyIn: MinorUnits.make(200_00),
        cashOut: MinorUnits.make(350_00),
        adjustment: MinorUnits.make(0),
        net: MinorUnits.make(150_00),
      },
    ],
    inPlay: [],
    others: [
      { displayName: "Sam", playing: false, net: MinorUnits.make(-50_00) },
      { displayName: "Sam", playing: false, net: MinorUnits.make(-100_00) },
    ],
    myVisitId: null,
  };

  vi.doMock("@tanstack/react-router", () => ({
    Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
  }));
  vi.doMock("~/components/ui/Dialog", () => ({
    Dialog: ({
      open,
      title,
      description,
      children,
    }: {
      open: boolean;
      title: ReactNode;
      description?: ReactNode;
      children: ReactNode;
    }) =>
      open ? (
        <div role="dialog" aria-label={String(title)}>
          <div>{description}</div>
          <div>{children}</div>
        </div>
      ) : null,
  }));

  const { SessionList } = await import("./SessionList");
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<SessionList sessions={[play]} detail={detail} />));
    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => button!.click());
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Gus");
    expect(dialog?.textContent).toContain("Sam");
    expect(dialog?.textContent).toContain("2h 30m");
  } finally {
    await act(async () => root.unmount());
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
