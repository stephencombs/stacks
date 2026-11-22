import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const setup = async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setOptions = vi.fn();
  const navigation = { setOptions };
  vi.doMock("@react-navigation/native", () => ({ useNavigation: () => navigation }));
  const { ScreenOptions } = await import("./ScreenOptions");
  const root = createRoot(document.createElement("div"));

  const render = (options: NativeStackNavigationOptions, optionsVersion?: number) =>
    act(async () =>
      root.render(
        optionsVersion === undefined ? (
          <ScreenOptions options={options} />
        ) : (
          <ScreenOptions options={options} optionsVersion={optionsVersion} />
        ),
      ),
    );

  return { setOptions, render };
};

it("sets the options once however often they are re-created", async () => {
  const { setOptions, render } = await setup();

  await render({ title: "Stats", headerRight: () => null });
  await render({ title: "Stats", headerRight: () => null });
  expect(setOptions).toHaveBeenCalledTimes(1);
});

it("sets them again when their shape changes", async () => {
  const { setOptions, render } = await setup();

  await render({ title: "Stats" });
  await render({ title: "Map" });
  expect(setOptions).toHaveBeenCalledTimes(2);
  expect(setOptions).toHaveBeenLastCalledWith({ title: "Map" });
});

it("sets them again when the version moves", async () => {
  const { setOptions, render } = await setup();

  await render({ headerRight: () => null }, 1);
  await render({ headerRight: () => null }, 1);
  await render({ headerRight: () => null }, 2);
  expect(setOptions).toHaveBeenCalledTimes(2);
});
