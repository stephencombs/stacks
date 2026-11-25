import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const setup = async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const empty = () => null;

  vi.doMock("react-native", () => ({
    ActivityIndicator: empty,
    Platform: { OS: "ios" },
    ScrollView: ({ children }: { children?: ReactNode }) => <div data-scroll>{children}</div>,
    View: passthrough,
  }));
  vi.doMock("react-native-safe-area-context", () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }));
  vi.doMock("@stacks/client-runtime/recordingReact", () => ({ useRecordingSync: empty }));
  vi.doMock("../components/ui/Text", () => ({ Text: passthrough }));
  vi.doMock("../components/BrandMark", () => ({ BrandMark: empty }));
  vi.doMock("../components/BrandWordmark", () => ({ BrandWordmark: empty }));
  vi.doMock("../components/ui/Button", () => ({ Button: empty }));
  vi.doMock("../components/ui/ControlSurface", () => ({ ControlSurface: passthrough }));
  vi.doMock("../components/ui/PressableScale", () => ({ PressableScale: passthrough }));
  vi.doMock("../components/ui/Icon", () => ({ Icon: empty }));
  vi.doMock("../components/ui/FloatingAction", () => ({ FloatingAction: passthrough }));
  vi.doMock("../components/ui/PinnedFooter", () => ({ PinnedFooter: passthrough }));
  vi.doMock("../components/ui/Sheet", () => ({
    SheetHost: ({ children }: { children?: ReactNode }) => children,
  }));
  vi.doMock("../components/ui/tabBar", () => ({
    useScreenFoot: () => ({
      scrollStyle: undefined,
      endSpace: 0,
      footerInset: 0,
      fabBottom: 0,
      above: undefined,
      onFooterLayout: () => undefined,
      onLiveBarHeight: () => undefined,
    }),
  }));
  vi.doMock("../lib/account", () => ({ useAccount: () => ({}) }));
  vi.doMock("./FeltStatusBar", () => ({ FeltStatusBar: empty }));
  vi.doMock("./LiveBar", () => ({ PersonalLiveBar: empty }));
  vi.doMock("./UserAvatar", () => ({ UserAvatar: empty }));
  vi.doMock("./You", () => ({ YouSheet: empty }));
  vi.doMock("./NativeHeaderActions", () => ({
    useNativeHeaderActions: () => <aside data-header />,
  }));

  const { PersonalScreen } = await import("./Personal");
  const element = document.createElement("div");
  const root = createRoot(element);

  return { element, root, PersonalScreen };
};

it("keeps the ScrollView ahead of the header's native sheet so the iOS 26 scroll edge blur can find it", async () => {
  const { element, root, PersonalScreen } = await setup();

  await act(async () => {
    root.render(
      <PersonalScreen>
        <span>Content</span>
      </PersonalScreen>,
    );
  });

  const screen = element.firstElementChild;

  const order = [...(screen?.children ?? [])].map((child) =>
    child.hasAttribute("data-scroll")
      ? "scroll"
      : child.hasAttribute("data-header")
        ? "header"
        : "",
  );

  expect(order[0]).toBe("scroll");
  expect(order).toContain("header");

  await act(async () => {
    root.unmount();
  });
});
