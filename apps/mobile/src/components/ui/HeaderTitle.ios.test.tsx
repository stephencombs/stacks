import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type SwiftButtonSnapshot = {
  readonly label: string;
  readonly systemImage?: string;
  readonly onPress?: () => void;
};

const setupHeaderTitle = async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const buttons: SwiftButtonSnapshot[] = [];
  let hostCount = 0;
  let popoverPresented = false;

  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  vi.doMock("react-native", () => ({
    Text: ({ children }: { children?: ReactNode }) => <span data-native-text>{children}</span>,
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: "light" }),
    useCSSVariable: () => "#111111",
  }));
  vi.doMock("@expo/ui", () => ({
    Host: ({ children }: { children?: ReactNode }) => {
      hostCount += 1;

      return <div data-host>{children}</div>;
    },
  }));
  vi.doMock("@expo/ui/swift-ui", () => ({
    Button: ({ label, systemImage, onPress }: SwiftButtonSnapshot) => {
      buttons.push({ label, systemImage, onPress });

      return (
        <button data-system-image={systemImage ?? ""} onClick={onPress}>
          {label}
        </button>
      );
    },
    Popover: Object.assign(
      ({ isPresented, children }: { isPresented?: boolean; children?: ReactNode }) => {
        popoverPresented = Boolean(isPresented);

        return <div data-popover={String(Boolean(isPresented))}>{children}</div>;
      },
      {
        Trigger: Container,
        Content: Container,
      },
    ),
    Text: Container,
    VStack: Container,
  }));
  vi.doMock("@expo/ui/swift-ui/modifiers", () => {
    const noop = () => ({});

    return Object.fromEntries([
      ["accessibilityHint", noop],
      ["accessibilityLabel", noop],
      ["buttonBorderShape", noop],
      ["buttonStyle", noop],
      ["font", noop],
      ["foregroundStyle", noop],
      ["frame", noop],
      ["lineLimit", noop],
      ["padding", noop],
    ]);
  });

  const { HeaderTitle } = await import("./HeaderTitle.ios");

  return {
    HeaderTitle,
    getHostCount: () => hostCount,
    getButtons: () => buttons,
    isPopoverOpen: () => popoverPresented,
  };
};

it("returns null for blank titles", async () => {
  const { HeaderTitle } = await setupHeaderTitle();
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(<HeaderTitle title="   " />));
  expect(container.innerHTML).toBe("");
  await act(async () => root.unmount());
});

it("renders plain text without a chevron or Host when there is no context or onExpand", async () => {
  const { HeaderTitle, getHostCount } = await setupHeaderTitle();
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(<HeaderTitle title="All sessions" context="   " />));
  expect(getHostCount()).toBe(0);
  expect(container.querySelector("[data-native-text]")?.textContent).toBe("All sessions");
  expect(container.querySelector("[data-system-image='chevron.down']")).toBeNull();
  await act(async () => root.unmount());
});

it("renders a chevron trigger and opens a popover when context is provided", async () => {
  const { HeaderTitle, getHostCount, isPopoverOpen } = await setupHeaderTitle();
  const container = document.createElement("div");
  const root = createRoot(container);

  await act(async () => root.render(<HeaderTitle title="Bellagio" context="Las Vegas trip" />));
  expect(getHostCount()).toBe(1);

  const trigger = [...container.querySelectorAll("button")].find(
    (button) => button.dataset.systemImage === "chevron.down",
  )!;

  expect(trigger.textContent).toBe("Bellagio");
  expect(isPopoverOpen()).toBe(false);

  await act(async () => trigger.click());
  expect(isPopoverOpen()).toBe(true);
  await act(async () => root.unmount());
});

it("renders a chevron trigger that calls onExpand directly", async () => {
  const { HeaderTitle, getHostCount } = await setupHeaderTitle();
  const container = document.createElement("div");
  const root = createRoot(container);
  let expanded = 0;

  await act(async () =>
    root.render(
      <HeaderTitle
        title="Friday Night"
        onExpand={() => {
          expanded += 1;
        }}
      />,
    ),
  );
  expect(getHostCount()).toBe(1);

  const trigger = [...container.querySelectorAll("button")].find(
    (button) => button.dataset.systemImage === "chevron.down",
  )!;

  await act(async () => trigger.click());
  expect(expanded).toBe(1);
  await act(async () => root.unmount());
});
