import { SessionId, TableId } from "@stacks/contracts";
import { useEffect, act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";

it("opens an imported table from its old link and shows unimported sessions read-only", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const sessionId = SessionId.make(crypto.randomUUID());
  const tableId = TableId.make(sessionId);
  const day = DateTime.makeUnsafe("2026-11-15T12:00:00Z");
  let imported = true;
  const dispatch = vi.fn();
  const navigation = { dispatch };
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  const details = {
    session: { id: sessionId, game: "blackjack", startedAt: day, endedAt: day, highLimit: false },
    venue: { name: "Tokyo table" },
    playerIds: [],
    entries: [],
    seatings: [],
  };

  vi.doMock("@react-navigation/native", () => ({
    useFocusEffect: useEffect,
    useNavigation: () => navigation,
    StackActions: {
      replace: (name: string, params: { readonly tableId: TableId }) => ({ name, params }),
    },
  }));
  vi.doMock("react-native", () => ({ View: Container, Text: Container, Platform: { OS: "ios" } }));
  vi.doMock("../components/Money", () => ({ Money: Container }));
  vi.doMock("../components/ui/Screen", () => ({ Screen: Container, screenError: vi.fn() }));
  vi.doMock("../components/ui/Surface", () => ({
    List: Container,
    PageTitle: Container,
    Row: Container,
    SectionHeading: Container,
    Tag: Container,
  }));
  vi.doMock("../features/ScreenSkeletons", () => ({ SessionScreenSkeleton: Container }));
  vi.doMock("../lib/stacks", () => ({
    useStacks: () => ({ session: () => "session", group: () => "group" }),
    Loaded: ({
      query,
      children,
    }: {
      query: "session" | "group";
      children: (
        data:
          | (typeof details & { importedTableId?: TableId })
          | { players: readonly []; group: { currency: "JPY" } },
      ) => ReactNode;
    }) =>
      children(
        query === "session"
          ? imported
            ? { ...details, importedTableId: tableId }
            : details
          : { players: [], group: { currency: "JPY" } },
      ),
  }));

  const { SessionScreen } = await import("./Session");
  const host = document.createElement("div");
  const root = createRoot(host);

  try {
    await act(async () => root.render(<SessionScreen route={{ params: { sessionId } }} />));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ name: "Table", params: { tableId } });

    imported = false;
    dispatch.mockClear();
    await act(async () => root.render(<SessionScreen route={{ params: { sessionId } }} />));
    expect(dispatch).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Tokyo table");
    expect(host.textContent).toContain("Read-only");
    expect(host.querySelector("button")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.resetModules();
    vi.unstubAllGlobals();
  }
});
