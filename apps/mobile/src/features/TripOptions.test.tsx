// @vitest-environment happy-dom
import {
  CurrencyCode,
  GroupId,
  PlayerId,
  TripId,
  UserId,
  type GroupDetail,
  type TripDetail,
} from "@stacks/contracts";
import * as DateTime from "effect/DateTime";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

it("opens the Rename trip sheet from Trip options and saves the trimmed name", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const day = DateTime.makeUnsafe("2026-11-15T12:00:00Z");
  const groupId = GroupId.make(crypto.randomUUID());
  const tripId = TripId.make(crypto.randomUUID());
  const trip: TripDetail = {
    trip: {
      id: tripId,
      groupId,
      name: "Vegas weekend",
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
  const group: GroupDetail = {
    group: { id: groupId, name: "Vegas crew", currency: CurrencyCode.make("USD"), createdAt: day },
    role: "member",
    myPlayerId: PlayerId.make(crypto.randomUUID()),
    players: [],
    trips: [trip.trip],
  };

  const runRename = vi.fn(async () => ({ ...trip.trip, name: "Reno weekend" }));
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  vi.doMock("@clerk/expo", () => ({ useAuth: () => ({ userId: "bea" }) }));
  vi.doMock("react-native", () => ({ View: Container, Text: Container }));
  vi.doMock("../lib/go", () => ({ useGo: () => ({ trip: vi.fn() }) }));
  vi.doMock("../lib/scope", () => ({ useScope: () => ({ forgetTrip: vi.fn() }) }));
  vi.doMock("../lib/stacks", () => ({
    useStacks: () => ({
      Client: { mutation: (_group: string, name: string) => name },
    }),
    useAction: (mutation: string) => ({
      run: mutation === "rename" ? runRename : vi.fn(),
      pending: false,
      error: null,
    }),
  }));
  vi.doMock("../components/ui/confirmAction", () => ({ confirmAction: vi.fn() }));
  vi.doMock("../components/ui/ActionMenu", () => ({
    ActionMenu: ({
      actions,
    }: {
      actions: ReadonlyArray<{ label: string; onPress: () => void }>;
    }) => (
      <div>
        {actions.map((action) => (
          <button key={action.label} onClick={action.onPress}>
            {action.label}
          </button>
        ))}
      </div>
    ),
  }));
  vi.doMock("../components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  }));
  vi.doMock("../components/ui/Field", () => ({
    FormError: Container,
    TextField: ({
      label,
      value,
      onChangeText,
      error,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      error?: string | null;
    }) => (
      <label>
        {label}
        <input value={value} onChange={(e) => onChangeText(e.target.value)} />
        {error ? <span role="alert">{error}</span> : null}
      </label>
    ),
  }));
  vi.doMock("../components/ui/Sheet", () => ({
    Sheet: ({
      open,
      title,
      footer,
      children,
    }: {
      open: boolean;
      title: string;
      footer?: ReactNode;
      children?: ReactNode;
    }) =>
      open ? (
        <div role="dialog" aria-label={title}>
          {children}
          {footer}
        </div>
      ) : null,
  }));

  const { TripOptionsButton } = await import("./TripOptions");
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => root.render(<TripOptionsButton trip={trip} group={group} />));
    const renameAction = [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Rename",
    );
    expect(renameAction).toBeDefined();
    await act(async () => renameAction!.click());
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Rename trip");

    const input = host.querySelector("input")!;
    const setInput = (next: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => setInput(""));
    const save = [...host.querySelectorAll("button")].find((b) => b.textContent === "Save")!;
    await act(async () => save.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Give the trip a name.");
    expect(runRename).not.toHaveBeenCalled();

    await act(async () => setInput("  Reno weekend  "));
    await act(async () => save.click());
    expect(runRename).toHaveBeenCalledWith({
      params: { tripId },
      payload: { name: "Reno weekend" },
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
