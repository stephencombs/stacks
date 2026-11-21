import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type StatusBarOptions = { readonly statusBarStyle?: string };

async function render(options: {
  os: string;
  focused: boolean;
  felt: boolean;
  theme?: "light" | "dark";
}) {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setOptionsCalls: StatusBarOptions[] = [];
  const { createContext } = await import("react");

  const NavigationContext = createContext<
    { setOptions: (opts: StatusBarOptions) => void } | undefined
  >(undefined);

  vi.doMock("react-native", () => ({ Platform: { OS: options.os } }));
  vi.doMock("@react-navigation/native", () => ({
    NavigationContext,
    useIsFocused: () => options.focused,
  }));
  vi.doMock("uniwind", () => ({
    useUniwind: () => ({ theme: options.theme ?? "light" }),
  }));
  vi.doMock("expo-status-bar", () => ({
    StatusBar: ({ style }: { style: string }) => <i data-status={style} />,
  }));

  const { FeltStatusBar } = await import("./FeltStatusBar");
  const { useState } = await import("react");

  function Harness() {
    const [navValue] = useState(() => ({
      setOptions: (opts: StatusBarOptions) => setOptionsCalls.push(opts),
    }));

    return (
      <NavigationContext value={navValue}>
        <FeltStatusBar felt={options.felt} />
      </NavigationContext>
    );
  }

  const element = document.createElement("div");
  const root = createRoot(element);

  await act(async () => root.render(<Harness />));

  return {
    statusBar: element.querySelector("i")?.getAttribute("data-status") ?? null,
    setOptionsCalls,
  };
}

it("draws light status-bar icons on the felt, but only while the felt is the screen you see", async () => {
  const androidFocused = await render({ os: "android", focused: true, felt: true });
  expect(androidFocused.statusBar).toBe("light");
  expect(androidFocused.setOptionsCalls).toEqual([]);

  const iosFocused = await render({ os: "ios", focused: true, felt: true, theme: "light" });
  expect(iosFocused.statusBar).toBe("light");
  expect(iosFocused.setOptionsCalls).toEqual([{ statusBarStyle: "light" }]);

  const androidBlurred = await render({ os: "android", focused: false, felt: true });
  expect(androidBlurred.statusBar).toBeNull();

  const iosBlurredLight = await render({ os: "ios", focused: false, felt: true, theme: "light" });
  expect(iosBlurredLight.statusBar).toBeNull();
  expect(iosBlurredLight.setOptionsCalls).toEqual([{ statusBarStyle: "dark" }]);
});

it("restores dark bar in light mode and light bar in dark mode off the felt", async () => {
  const androidOff = await render({ os: "android", focused: true, felt: false });
  expect(androidOff.statusBar).toBeNull();
  expect(androidOff.setOptionsCalls).toEqual([]);

  const iosLightOff = await render({ os: "ios", focused: true, felt: false, theme: "light" });
  expect(iosLightOff.statusBar).toBeNull();
  expect(iosLightOff.setOptionsCalls).toEqual([{ statusBarStyle: "dark" }]);

  const iosDarkOff = await render({ os: "ios", focused: true, felt: false, theme: "dark" });
  expect(iosDarkOff.statusBar).toBeNull();
  expect(iosDarkOff.setOptionsCalls).toEqual([{ statusBarStyle: "light" }]);
});
