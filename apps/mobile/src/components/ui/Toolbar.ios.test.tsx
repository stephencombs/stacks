import type { NativeStackHeaderItem } from "@react-navigation/native-stack";
import { act, Fragment, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type Options = {
  unstable_headerLeftItems?: () => NativeStackHeaderItem[];
  unstable_headerRightItems?: () => NativeStackHeaderItem[];
};

const setup = async () => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setOptions = vi.fn<(options: Options) => void>();
  const navigation = { setOptions };
  vi.doMock("@react-navigation/native", () => ({ useNavigation: () => navigation }));
  const { Toolbar } = await import("./Toolbar.ios");

  const mount = async (element: ReactNode) => {
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(element));

    return root;
  };

  const rightItems = () => setOptions.mock.lastCall![0].unstable_headerRightItems!();

  return { Toolbar, setOptions, mount, rightItems };
};

it("turns declared children into native items, left to right", async () => {
  const { Toolbar, mount, rightItems } = await setup();
  const onGroups = vi.fn();
  const onYou = vi.fn();

  await mount(
    <Toolbar placement="right">
      <Toolbar.Button
        label="Groups"
        separateBackground
        identifier="crew-groups"
        onPress={onGroups}
      />
      {false}
      <Fragment>
        <Toolbar.Button icon="person" accessibilityLabel="You" onPress={onYou} />
      </Fragment>
    </Toolbar>,
  );

  const [groups, you] = rightItems();
  expect(groups).toMatchObject({
    type: "button",
    label: "Groups",
    sharesBackground: false,
    identifier: "crew-groups",
  });
  expect(you).toMatchObject({
    type: "button",
    label: "You",
    icon: { type: "sfSymbol", name: "person" },
  });

  if (groups?.type === "button") groups.onPress();
  expect(onGroups).toHaveBeenCalledTimes(1);
  expect(onYou).not.toHaveBeenCalled();
});

it("maps a menu to checked actions that run their own handler", async () => {
  const { Toolbar, mount, rightItems } = await setup();
  const byYear = vi.fn();

  await mount(
    <Toolbar placement="right">
      <Toolbar.Menu title="By month" accessibilityLabel="Group by">
        <Toolbar.MenuAction title="By month" isOn onPress={() => {}} />
        <Toolbar.MenuAction title="By year" onPress={byYear} />
      </Toolbar.Menu>
    </Toolbar>,
  );

  const [menu] = rightItems();

  if (menu?.type !== "menu") throw new Error("expected a menu");

  expect(menu.label).toBe("By month");
  expect(menu.menu.items.map((item) => item.type === "action" && item.state)).toEqual([
    "on",
    "off",
  ]);

  const [, year] = menu.menu.items;

  if (year?.type === "action") year.onPress();
  expect(byYear).toHaveBeenCalledTimes(1);
});

it("indexes spacers in the order native-stack reads each placement", async () => {
  const { Toolbar, setOptions, mount } = await setup();

  await mount(
    <Toolbar placement="right">
      <Toolbar.Button label="Groups" onPress={() => {}} />
      <Toolbar.Spacer width={8} />
      <Toolbar.Button label="You" onPress={() => {}} />
    </Toolbar>,
  );

  await mount(
    <Toolbar placement="left">
      <Toolbar.Button label="Filter" onPress={() => {}} />
      <Toolbar.Spacer width={8} />
      <Toolbar.Button label="Clear" onPress={() => {}} />
    </Toolbar>,
  );

  const [right, left] = setOptions.mock.calls.map(([options]) =>
    (options.unstable_headerRightItems ?? options.unstable_headerLeftItems)!(),
  );

  expect(right?.[1]).toMatchObject({ type: "spacing", spacing: 8, index: 1 });
  expect(left?.[1]).toMatchObject({ type: "spacing", spacing: 8, index: 1 });
  expect(right?.map((item) => item.type)).toEqual(["button", "spacing", "button"]);
});

it("keeps the native items across re-renders and calls the latest handler", async () => {
  const { Toolbar, setOptions, mount, rightItems } = await setup();
  const first = vi.fn();
  const second = vi.fn();

  const root = await mount(
    <Toolbar placement="right">
      <Toolbar.Button label="Edit" onPress={first} />
    </Toolbar>,
  );

  expect(setOptions).toHaveBeenCalledTimes(1);
  const [item] = rightItems();

  await act(async () =>
    root.render(
      <Toolbar placement="right">
        <Toolbar.Button label="Edit" onPress={second} />
      </Toolbar>,
    ),
  );

  expect(setOptions).toHaveBeenCalledTimes(1);

  if (item?.type === "button") item.onPress();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);

  await act(async () =>
    root.render(
      <Toolbar placement="right">
        <Toolbar.Button label="Done" onPress={second} />
      </Toolbar>,
    ),
  );

  expect(setOptions).toHaveBeenCalledTimes(2);
});

it("shows the latest custom view without setting the items again", async () => {
  const { Toolbar, setOptions, mount, rightItems } = await setup();

  const toolbar = (name: string) => (
    <Toolbar placement="right">
      <Toolbar.Custom hidesSharedBackground>
        <span>{name}</span>
      </Toolbar.Custom>
    </Toolbar>
  );

  const root = await mount(toolbar("Ada"));
  const [custom] = rightItems();

  if (custom?.type !== "custom") throw new Error("expected a custom item");

  expect(custom.hidesSharedBackground).toBe(true);
  const host = document.createElement("div");
  const view = createRoot(host);
  await act(async () => view.render(custom.element));
  expect(host.textContent).toBe("Ada");

  await act(async () => root.render(toolbar("Grace")));
  expect(host.textContent).toBe("Grace");
  expect(setOptions).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
});

it("clears its placement when it unmounts", async () => {
  const { Toolbar, setOptions, mount } = await setup();

  const root = await mount(
    <Toolbar placement="left">
      <Toolbar.Button label="Filter" onPress={() => {}} />
    </Toolbar>,
  );

  expect(setOptions).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
  expect(setOptions).toHaveBeenCalledTimes(2);
  expect(setOptions.mock.lastCall![0].unstable_headerLeftItems!()).toEqual([]);
});
