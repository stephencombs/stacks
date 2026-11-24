import {
  sessionCardModel,
  tripCardModel,
  type SessionCardModel,
  type TripCardModel,
} from "@stacks/client-runtime/shareCard";
import { localClock } from "@stacks/client-runtime/trip";
import { CurrencyCode, MinorUnits, PlayerId, SessionId, VenueId } from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import type { TripSession } from "@stacks/shared/trips";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const usd = CurrencyCode.make("USD");

const player = (n: number) =>
  PlayerId.make(`0192e7a0-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`);

const at = (day: number, hour: number) =>
  DateTime.makeUnsafe(new Date(2026, 9, day, hour).getTime());

const tag = (name: "div" | "span" | "svg" | "circle" | "line" | "polyline" | "b") => {
  const Element = name;

  return ({ children }: { children?: ReactNode }) => <Element>{children}</Element>;
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

const render = async (model: TripCardModel | SessionCardModel) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.doMock("react-native", () => ({ View: tag("div"), Text: tag("span") }));
  vi.doMock("react-native-svg", () => ({
    default: tag("svg"),
    Circle: tag("circle"),
    Line: tag("line"),
    Polyline: tag("polyline"),
  }));
  vi.doMock("uniwind", () => ({
    ScopedTheme: ({ children }: { children?: ReactNode }) => <>{children}</>,
    useCSSVariable: (names: ReadonlyArray<string>) => names.map(() => "#fff"),
  }));
  vi.doMock("./Chip", () => ({ Chip: ({ name }: { name: string }) => <i data-chip={name} /> }));
  vi.doMock("../components/BrandWordmark", () => ({ BrandWordmark: tag("b") }));
  vi.doMock("../lib/preferences", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../lib/preferences")>()),
    usePreferences: () => ({ privacyMode: false, showCents: false }),
  }));

  const { TripCard } = await import("./TripCard");
  const { SessionCard } = await import("./SessionCard");
  const host = document.createElement("div");
  const root = createRoot(host);

  await act(async () =>
    root.render(model.kind === "trip" ? <TripCard model={model} /> : <SessionCard model={model} />),
  );

  return { host, unmount: () => act(async () => root.unmount()) };
};

const crowd = Array.from({ length: 11 }, (_, i) => i + 1);

const sessions: ReadonlyArray<TripSession> = [
  {
    session: {
      id: SessionId.make("0192e7a0-0000-7000-8000-000000000101"),
      startedAt: at(20, 20),
    },
    venue: { id: VenueId.make("0192e7a0-0000-7000-8000-000000000002") },
    results: crowd.map((id) => ({
      playerId: player(id),
      buyIn: MinorUnits.make(10_000),
      net: MinorUnits.make(246_800 - id * 40_000),
    })),
  },
];

const trip = (hidden: boolean) =>
  tripCardModel({
    name: "Vegas weekend",
    dates: "Oct 20 – Oct 21",
    venues: ["Circa"],
    currency: usd,
    me: player(10),
    closed: sessions,
    players: crowd.map((id) => ({ id: player(id), displayName: `Player ${id}` })),
    chip: (id) => Number(id.slice(-2)),
    clock: localClock,
    hidden,
  });

const session = (hidden: boolean) =>
  sessionCardModel({
    venue: "Circa",
    game: "Blackjack",
    startedAt: at(24, 20),
    finishedAt: at(24, 23),
    currency: usd,
    result: MinorUnits.make(41_150),
    buyIn: MinorUnits.make(30_000),
    cashOut: MinorUnits.make(71_150),
    hourly: 13_716,
    hidden,
  });

it("a trip card shows standings capped at 8 with you included, your result and the line", async () => {
  const view = await render(trip(false));

  try {
    const names = [...view.host.querySelectorAll("[data-chip]")].map((chip) =>
      chip.getAttribute("data-chip"),
    );

    expect(names).toEqual([
      "Player 1",
      "Player 2",
      "Player 3",
      "Player 4",
      "Player 5",
      "Player 6",
      "Player 7",
      "Player 10",
    ]);

    const text = view.host.textContent!;

    expect(text).toContain("Vegas weekend");
    expect(text).toContain("Oct 20 – Oct 21 · Circa");
    expect(text).toContain("Player 10 · You");
    expect(text).toContain("+3 more");
    expect(text).toContain("Your result");
    expect(text).toContain("1 session · 1 night");
    expect(text).toMatch(/\+\$2,068/);
    expect(view.host.querySelector("polyline")).not.toBeNull();
  } finally {
    await view.unmount();
  }
});

it("a hidden trip card keeps ranks, names and chips and no money, line or axis", async () => {
  const view = await render(trip(true));

  try {
    const text = view.host.textContent!;

    expect(text).toContain("Player 10 · You");
    expect(text).toContain("+3 more");
    expect(text).toContain("Your place");
    expect(text).toContain("10th");
    expect(view.host.querySelectorAll("[data-chip]")).toHaveLength(8);
    expect(text).not.toMatch(/[$+\-–]\$|\$|•/);
    expect(text).not.toContain("Your result");
    expect(view.host.querySelector("svg")).toBeNull();
    expect(view.host.querySelector("polyline")).toBeNull();
    expect(view.host.querySelector("line")).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("a session card shows the result, buy-in, cash-out and hourly beside the venue and game", async () => {
  const view = await render(session(false));

  try {
    const text = view.host.textContent!;

    expect(text).toContain("Circa");
    expect(text).toContain("Blackjack");
    expect(text).toContain("3h 00m");
    expect(text).toContain("+$411.50");
    expect(text).toContain("$300");
    expect(text).toContain("$711.50");
    expect(text).toContain("/hr");
    expect(view.host.querySelector("polyline")).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("a hidden session card has the venue, game, date and duration and no money", async () => {
  const view = await render(session(true));

  try {
    const text = view.host.textContent!;

    expect(text).toContain("Circa");
    expect(text).toContain("Blackjack");
    expect(text).toContain("3h 00m");
    expect(text).not.toContain("$");
    expect(text).not.toContain("/hr");
    expect(text).not.toContain("Your result");
    expect(text).not.toMatch(/411|300|711|137/);
  } finally {
    await view.unmount();
  }
});
