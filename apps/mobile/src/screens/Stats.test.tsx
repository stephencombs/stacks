// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

type Account = { available: true; isLoaded: true; isSignedIn: boolean; userId: string | null };

/** Stats with its edges stubbed. The group view reads the signed-in client, as the real one does. */
async function load(account: Account) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  vi.doMock("react-native", () => ({ Text: Container, View: Container }));
  vi.doMock("react-native-svg", () => ({ default: Container }));
  vi.doMock("uniwind", () => ({ useCSSVariable: () => [] }));
  vi.doMock("@stacks/client-runtime/recordingReact", () => ({
    useRecordingHome: () => ({ home: null, status: "loading", error: null, retryLoad: () => {} }),
  }));
  vi.doMock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: () => {} }) }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: () => null }));
  vi.doMock("../components/Money", () => ({ Money: () => null }));
  vi.doMock("../components/ui/Button", () => ({ Button: () => null }));
  vi.doMock("../components/ui/FilterChip", () => ({ FilterChip: () => null }));
  vi.doMock("../components/ui/Surface", () => ({
    EmptyState: Container,
    List: Container,
    Row: Container,
    SectionHeading: Container,
    Skeleton: () => <span>Loading your play</span>,
  }));
  vi.doMock("../features/GroupStats", async () => {
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
  }));
  vi.doMock("../features/RecordingForms", () => ({ PastSessionSheet: () => null }));
  vi.doMock("../features/StatsParts", () => ({
    ByCasino: () => null,
    ByGame: () => null,
    Figure: Container,
    Filters: () => null,
    chipColor: {},
    signed: () => "",
  }));
  vi.doMock("../lib/account", () => ({ useAccount: () => account }));
  vi.doMock("../lib/stacks", async () => {
    const { StacksContext, useStacks } = await vi.importActual<
      typeof import("@stacks/client-runtime/react")
    >("@stacks/client-runtime/react");
    const stacks = { groups: (await import("effect/reactivity/Atom")).make([]) };
    return {
      StacksProvider: ({ children }: { children: ReactNode }) => (
        <StacksContext value={stacks as never}>{children}</StacksContext>
      ),
      useStacks,
      useStatsCopies: () => null,
    };
  });
  const { StatsScreen } = await import("./Stats");
  const element = document.createElement("div");
  const errors: unknown[] = [];
  const root = createRoot(element, { onUncaughtError: (error) => errors.push(error) });
  return { StatsScreen, element, errors, root };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

const groupId = "5f0e2c0e-6f43-4a44-9d0a-4f8f4bb0a001";
const route = { params: { groupId } } as never;

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
