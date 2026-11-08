// @vitest-environment happy-dom
import { act, createElement, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

type Auth = { isLoaded: boolean; isSignedIn?: boolean; userId?: string | null };
type Metrics = {
  frame: { x: number; y: number; width: number; height: number };
  insets: { top: number; right: number; bottom: number; left: number };
} | null;
type StackConfig = {
  initialRouteName: string;
  layout?: ComponentType<{
    state: { index: number; routes: { name: string }[] };
    children?: ReactNode;
  }>;
  screens: Record<string, { screen: unknown; linking?: unknown }>;
};

const SIGNED_OUT = { isLoaded: true, isSignedIn: false, userId: null };
const SIGNED_IN = { isLoaded: true, isSignedIn: true, userId: "user-1" };

/** The app with its native edges stubbed: Clerk, navigation, storage and the screens themselves. */
async function load({
  key = "test",
  auth = SIGNED_OUT,
  metrics = null,
}: { key?: string; auth?: Auth; metrics?: Metrics } = {}) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const Container = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  const window = { width: 440, height: 956, scale: 3, fontScale: 1 };
  vi.doMock("react-native", () => ({
    View: Container,
    Text: Container,
    Dimensions: { get: () => window },
    useWindowDimensions: () => window,
    StyleSheet: { create: (styles: object) => styles },
  }));
  vi.doMock("react-native-safe-area-context/lib/module/NativeSafeAreaProvider", () => ({
    NativeSafeAreaProvider: Container,
  }));
  const { SafeAreaProvider, useSafeAreaInsets } = await vi.importActual<
    typeof import("react-native-safe-area-context")
  >("react-native-safe-area-context/lib/module/SafeAreaContext");
  vi.doMock("react-native-safe-area-context", () => ({
    SafeAreaProvider,
    initialWindowMetrics: metrics,
  }));
  vi.doMock("@clerk/expo", () => ({
    ClerkProvider: ({ children }: { children: ReactNode }) =>
      createElement("div", { "data-clerk": "mounted" }, children),
    useAuth: () => auth,
  }));
  vi.doMock("@clerk/expo/token-cache", () => ({ tokenCache: {} }));
  vi.doMock("expo", () => ({ reloadAppAsync: vi.fn() }));
  const markStartup = vi.fn();
  vi.doMock("./lib/diagnostics", () => ({ markStartup, reportStartupError: vi.fn() }));
  vi.doMock("./lib/config", () => ({ clerkPublishableKey: key }));
  vi.doMock("./lib/theme", () => ({}));
  vi.doMock("./lib/fonts", () => ({ useAppFonts: () => {} }));
  // Real recording hooks over a store whose storage never opens, as on a slow first launch.
  vi.doMock("./lib/recording", async () => {
    const { openDeviceRecordingStore } = await vi.importActual<
      typeof import("@stacks/client-runtime/recordingReact")
    >("@stacks/client-runtime/recordingReact");
    return { recordingStore: openDeviceRecordingStore(() => new Promise(() => {})) };
  });
  vi.doMock("./screens/Home", async () => {
    const { useRecordingHome } = await vi.importActual<
      typeof import("@stacks/client-runtime/recordingReact")
    >("@stacks/client-runtime/recordingReact");
    return {
      HomeScreen: () => createElement("main", null, `Your play: ${useRecordingHome().status}`),
    };
  });
  vi.doMock("expo-linking", () => ({
    createURL: () => "stacks://",
    getInitialURL: () => new Promise<string | null>(() => {}),
  }));
  vi.doMock("expo-status-bar", () => ({ StatusBar: () => null }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: "dark" }),
    useCSSVariable: () => ["black", "white", "gray", "gold", "red"],
  }));
  const stacks: StackConfig[] = [];
  const dispatch = vi.fn();
  type NavigationProps = {
    linking: { config: { initialRouteName: string }; getInitialURL: () => Promise<string | null> };
    onReady: () => void;
  };
  const navigation = vi.fn((_props: NavigationProps) => null as ReactNode);
  vi.doMock("@react-navigation/native", () => ({
    DarkTheme: { colors: {}, fonts: {} },
    DefaultTheme: { colors: {}, fonts: {} },
    StackActions: { popTo: (name: string) => ({ type: "POP_TO", payload: { name } }) },
    useNavigation: () => ({ dispatch }),
    // Draws the root stack's first screen under the real providers, as the native stack would.
    createStaticNavigation: ({ config }: { config: StackConfig }) =>
      function Navigation(props: NavigationProps) {
        navigation(props);
        const { top, right, bottom, left } = useSafeAreaInsets();
        const first = config.screens[config.initialRouteName]!.screen as ComponentType;
        return createElement(
          "div",
          { "data-insets": [top, right, bottom, left].join(",") },
          createElement(first),
        );
      },
  }));
  vi.doMock("@react-navigation/native-stack", () => ({
    createNativeStackNavigator: (config: StackConfig) => {
      stacks.push(config);
      return { config };
    },
  }));
  vi.doMock("./features/PlaceTabs", () => ({
    createPlaceTabs: vi.fn(),
    placeTab: vi.fn(),
    placeTabsConfig: {},
    useTabBarHeight: vi.fn(),
  }));
  vi.doMock("./components/ui/Button", () => ({
    Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
      createElement("button", { onClick: onPress }, label),
  }));
  vi.doMock("./features/Landing", () => ({
    Landing: ({ invited }: { invited: boolean }) =>
      createElement("section", null, invited ? "Sign in to join" : "Sign in"),
  }));
  vi.doMock("./lib/stacks", () => ({
    StacksProvider: ({ userId, children }: { userId: string; children: ReactNode }) =>
      createElement("div", { "data-user": userId }, children),
    Prefetch: Container,
    useLastTrip: vi.fn(),
    useStacks: vi.fn(),
  }));
  for (const [module, names] of Object.entries({
    "./components/ui/Screen": ["TabBarHeight"],
    "./features/Personal": ["PersonalNav"],
    "./features/Scope": ["ScopeButton"],
    "./features/You": ["YouButton"],
    "./lib/scope": ["ScopeProvider", "useScopeHasTrip"],
    "./screens/Board": ["BoardScreen"],
    "./screens/Invites": ["ClaimScreen", "JoinScreen"],
    "./screens/Group": ["GroupScreen"],
    "./screens/GroupSettings": ["GroupSettingsScreen"],
    "./screens/Groups": ["GroupsScreen", "NoGroups"],
    "./screens/NewSession": ["NewSessionScreen"],
    "./screens/People": ["PeopleScreen"],
    "./screens/Play": ["PlayScreen"],
    "./screens/Session": ["SessionScreen"],
    "./screens/Sessions": ["SessionsScreen"],
    "./screens/SettleUp": ["SettleUpScreen"],
  }))
    vi.doMock(module, () => Object.fromEntries(names.map((name) => [name, Container])));

  const { default: App } = await import("./App");
  const { AccountProvider } = await import("./lib/account");
  const render = async (element: ReactNode) => {
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(element));
    roots.push(root);
    return host;
  };
  const root = stacks.find((stack) => "Home" in stack.screens)!;
  const account = stacks.find((stack) => "Places" in stack.screens)!;
  /** The account area's gate with `route` in front, inside the app's sign-in. */
  const gate = (route = "Places") =>
    render(
      createElement(
        AccountProvider,
        null,
        createElement(
          account.layout!,
          { state: { index: 0, routes: [{ name: route }] } },
          "Places",
        ),
      ),
    );
  return { App, render, gate, root, account, navigation, markStartup, dispatch };
}

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  vi.useRealTimers();
});

it.each([
  { label: "while sign-in loads", key: "test", auth: { isLoaded: false } },
  { label: "signed out", key: "test", auth: SIGNED_OUT },
  { label: "signed in", key: "test", auth: SIGNED_IN },
  { label: "without sign-in in this build", key: "", auth: SIGNED_OUT },
])("opens on your play $label", async ({ key, auth }) => {
  const app = await load({ key, auth });
  const host = await app.render(createElement(app.App));
  // Recording reaches its store whatever sign-in is doing; nothing waits on an account.
  expect(host.textContent).toBe("Your play: loading");
  expect(host.querySelector("[data-clerk]") !== null).toBe(key !== "");

  const { linking, onReady } = app.navigation.mock.calls[0]![0];
  expect(linking.config.initialRouteName).toBe("Home");
  vi.useFakeTimers();
  const url = linking.getInitialURL();
  await vi.advanceTimersByTimeAsync(1_500);
  await expect(url).resolves.toBeNull();
  expect(app.markStartup).toHaveBeenCalledWith("initial_url_timeout");
  onReady();
  expect(app.markStartup).toHaveBeenCalledWith("navigation_ready");
});

it("keeps every address: your play at the root, groups and invites behind the account gate", async () => {
  const { root, account } = await load();
  expect(root.initialRouteName).toBe("Home");
  expect(root.screens.Home!.linking).toBe("");
  expect(root.screens.Play!.linking).toBe("play/:visitId");
  expect(root.screens.Account!.screen).toEqual({ config: account });
  expect(account.screens.Groups!.linking).toBe("groups");
  expect(account.screens.Join!.linking).toBe("join/:code");
  expect(account.screens.Claim!.linking).toBe("claim/:code");
});

it.each([
  {
    label: "unavailable",
    metrics: null,
    insets: "0,0,0,0",
  },
  {
    label: "available",
    metrics: {
      frame: { x: 0, y: 0, width: 440, height: 956 },
      insets: { top: 62, right: 0, bottom: 34, left: 0 },
    },
    insets: "62,0,34,0",
  },
])("starts without native inset events ($label)", async ({ metrics, insets }) => {
  const app = await load({ metrics });
  const host = await app.render(createElement(app.App));
  expect(host.querySelector("[data-insets]")?.getAttribute("data-insets")).toBe(insets);
});

it("holds account screens until sign-in loads, then says it can't reach it", async () => {
  vi.useFakeTimers();
  const app = await load({ auth: { isLoaded: false } });
  const host = await app.gate();
  expect(host.textContent).toBe("Opening Color Up…");
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(host.textContent).toContain("Can't sign in yet");
  expect(host.textContent).toContain("Back to your play");
  expect(host.textContent).not.toContain("Places");
});

it("asks a signed-out visitor to sign in, naming the invitation on a join link", async () => {
  const app = await load({ auth: SIGNED_OUT });
  expect((await app.gate()).textContent).toBe("Sign in");
  expect((await app.gate("Join")).textContent).toBe("Sign in to join");
  expect((await app.gate("Claim")).textContent).toBe("Sign in to join");
  expect(app.markStartup).toHaveBeenCalledWith("landing_ready");
});

it("explains groups need sign-in when this build has none", async () => {
  const app = await load({ key: "" });
  const host = await app.gate("Join");
  expect(host.textContent).toContain("Groups and trips need sign-in");
  expect(host.textContent).not.toContain("Places");
  await act(async () => host.querySelector("button")!.click());
  expect(app.dispatch).toHaveBeenCalledWith({ type: "POP_TO", payload: { name: "Home" } });
});

it("opens account screens for whoever is signed in", async () => {
  const app = await load({ auth: SIGNED_IN });
  const host = await app.gate();
  expect(host.querySelector("[data-user]")?.getAttribute("data-user")).toBe("user-1");
  expect(host.textContent).toBe("Places");
});
