import { act, createContext, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

type Place = { key: string; title: string };

const setup = async (initial: ReadonlyArray<Place>) => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setOptions = vi.fn();
  const open = vi.fn();
  let live = initial;

  vi.doMock("react-native", () => ({
    Pressable: ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  }));
  vi.doMock("../components/ui/tabBar", () => ({
    LIVE_ACCESSORY_HEIGHT: 56,
    LiveAccessoryHeight: createContext(0),
  }));
  vi.doMock("@react-navigation/native", () => ({ useNavigation: () => ({ setOptions }) }));

  vi.doMock("./LiveBar", () => ({
    useLiveSessions: () => live,
    useOpenLive: () => open,
    liveBar: (
      places: ReadonlyArray<Place>,
      openPlace: (place: Place) => void,
      pick: () => void,
    ) => {
      const [newest, ...rest] = places;

      return newest
        ? {
            title: newest.title,
            label: `${places.length} live`,
            hint: "",
            onPress: rest.length === 0 ? () => openPlace(newest) : pick,
          }
        : null;
    },
    BarContent: ({ title, className }: { title: string; className: string }) => (
      <span data-class={className}>{title}</span>
    ),
    LivePicker: ({ live: places }: { live: ReadonlyArray<Place> }) => (
      <aside data-picker>{places.length}</aside>
    ),
  }));

  const accessory = await import("./LiveAccessory");
  const element = document.createElement("div");
  const root = createRoot(element);

  const render = (accessories = false) => {
    const placements = accessories
      ? (["regular", "inline"] as const).map((placement) => (
          <div key={placement}>{setOptions.mock.lastCall?.[0].bottomAccessory({ placement })}</div>
        ))
      : null;

    const screen = accessory.liveAccessoryLayout({ children: placements });

    return act(async () => {
      root.render(<accessory.LiveAccessoryHost>{screen}</accessory.LiveAccessoryHost>);
    });
  };

  return {
    element,
    root,
    setOptions,
    open,
    render,
    set: (next: ReadonlyArray<Place>) => {
      live = next;
    },
  };
};

const one = [{ key: "a", title: "Blackjack" }];
const two = [...one, { key: "b", title: "Poker" }];

it("renders both placements, tuned to their capsule, and opens one picker for several sessions", async () => {
  const { element, root, render } = await setup(two);
  await render();
  await render(true);

  const classes = [...element.querySelectorAll("[data-class]")].map((node) =>
    node.getAttribute("data-class"),
  );

  expect(classes).toEqual(["min-h-0 flex-1 py-0", "min-h-0 flex-1 gap-2 px-3 py-0"]);
  expect(element.querySelectorAll("[data-picker]")).toHaveLength(0);

  await act(async () => {
    element.querySelectorAll("button")[1]?.click();
  });
  expect(element.querySelectorAll("[data-picker]")).toHaveLength(1);

  await act(async () => {
    root.unmount();
  });
});

it("opens the session straight from the accessory when only one is live", async () => {
  const { element, root, open, render } = await setup(one);
  await render();
  await render(true);

  await act(async () => {
    element.querySelector("button")?.click();
  });
  expect(open).toHaveBeenCalledWith(one[0]);
  expect(element.querySelectorAll("[data-picker]")).toHaveLength(0);

  await act(async () => {
    root.unmount();
  });
});

it("hands the tab bar an accessory only while something is live", async () => {
  const { root, setOptions, set, render } = await setup([]);

  await render();
  expect(setOptions.mock.lastCall?.[0]).toStrictEqual({ bottomAccessory: undefined });

  set(one);
  await render();
  expect(setOptions.mock.lastCall?.[0].bottomAccessory).toBeTypeOf("function");

  set([]);
  await render();
  expect(setOptions.mock.lastCall?.[0]).toStrictEqual({ bottomAccessory: undefined });

  await act(async () => {
    root.unmount();
  });
});

it("calls no hooks when the navigator invokes the screen layout", async () => {
  await setup(one);
  const accessory = await import("./LiveAccessory");

  expect(() => accessory.liveAccessoryLayout({ children: null })).not.toThrow();
});
