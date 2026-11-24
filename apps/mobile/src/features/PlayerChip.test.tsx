import { PlayerId } from "@stacks/contracts";
import { tableChipOf } from "@stacks/client-runtime/trip";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  // SAFETY: the box starts empty and each test assigns the photo it needs.
  const photo = { current: null as string | null };
  const variables: string[] = [];

  return { os: { current: "ios" }, photo, variables, fail: { current: () => {} } };
});

type Styled = { style?: object; children?: ReactNode };

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.os.current;
    },
  },
  View: ({ style, children }: Styled) => <div data-style={JSON.stringify(style)}>{children}</div>,
  Image: ({ source, onError }: { source: { uri: string }; onError?: () => void }) => {
    mocks.fail.current = () => onError?.();

    return <img src={source.uri} alt="" />;
  },
}));

vi.mock("react-native-svg", () => {
  const Mark = () => <i data-mark />;

  return {
    default: ({ children }: Styled) => <svg>{children}</svg>,
    Circle: Mark,
    G: ({ children }: Styled) => <g>{children}</g>,
    Rect: Mark,
  };
});

vi.mock("../components/ui/Text", () => ({
  Text: ({ children }: Styled) => <span data-initial>{children}</span>,
}));

vi.mock("uniwind", () => ({
  useCSSVariable: (names: string | string[]) => {
    mocks.variables.push(...[names].flat());

    return Array.isArray(names) ? names.map(() => "#999999") : "#999999";
  },
}));

vi.mock("../lib/contactPhotos", () => ({ useContactPhoto: () => mocks.photo.current }));

const player = PlayerId.make("0192e7a0-0000-7000-8000-000000000001");

const render = async (
  element: (parts: typeof import("./PlayerChip") & typeof import("./Chip")) => ReactNode,
) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const parts = { ...(await import("./PlayerChip")), ...(await import("./Chip")) };
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(element(parts)));

  return {
    host,
    image: () => host.querySelector("img"),
    initial: () => host.querySelector("[data-initial]")?.textContent ?? null,
    border: () => {
      const style = host.querySelector("[data-style]")?.getAttribute("data-style");

      const parsed: { borderWidth?: number; borderColor?: string } | null = style
        ? JSON.parse(style)
        : null;

      return parsed;
    },
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => {
  mocks.os.current = "ios";
  mocks.photo.current = null;
  mocks.variables.length = 0;
  vi.unstubAllGlobals();
});

it("draws a linked photo inside a ring in the player's chip color, with no stripes", async () => {
  mocks.photo.current = "file:///photos/ada.jpg";

  const view = await render(({ PlayerChip }) => (
    <PlayerChip playerId={player} chip={3} name="Ada" size={32} />
  ));

  try {
    expect(view.image()?.getAttribute("src")).toBe("file:///photos/ada.jpg");
    expect(view.border()).toMatchObject({ borderWidth: 2, borderColor: "#999999" });
    expect(mocks.variables).toContain("--color-chip-3");
    expect(view.host.querySelector("svg")).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("thins the ring below 26pt", async () => {
  mocks.photo.current = "file:///photos/ada.jpg";

  const view = await render(({ PlayerChip }) => (
    <PlayerChip playerId={player} chip={3} name="Ada" size={22} />
  ));

  try {
    expect(view.border()?.borderWidth).toBe(1.5);
  } finally {
    await view.unmount();
  }
});

it("falls back to the initial when a player has no photo", async () => {
  const view = await render(({ PlayerChip }) => (
    <PlayerChip playerId={player} chip={3} name="Ada" />
  ));

  try {
    expect(view.image()).toBeNull();
    expect(view.initial()).toBe("A");
  } finally {
    await view.unmount();
  }
});

it("falls back to the initial when the photo won't load", async () => {
  mocks.photo.current = "file:///photos/gone.jpg";

  const view = await render(({ PlayerChip }) => (
    <PlayerChip playerId={player} chip={3} name="Ada" />
  ));

  try {
    expect(view.image()).not.toBeNull();
    await act(async () => mocks.fail.current());
    expect(view.image()).toBeNull();
    expect(view.initial()).toBe("A");
  } finally {
    await view.unmount();
  }
});

it("never gives a plain chip, such as a venue's, a photo", async () => {
  mocks.photo.current = "file:///photos/ada.jpg";
  const view = await render(({ Chip }) => <Chip chip={2} name="Bellagio" size={28} />);

  try {
    expect(view.image()).toBeNull();
    expect(view.initial()).toBe("B");
  } finally {
    await view.unmount();
  }
});

it("colors a table player from their ID, ringed on Android only", async () => {
  mocks.os.current = "android";
  const android = await render(({ TableChip }) => <TableChip playerId={player} name="Ada" />);

  try {
    expect(mocks.variables).toContain(`--color-chip-${tableChipOf(player)}`);
    expect(android.host.querySelectorAll("[data-mark]").length).toBe(2);
  } finally {
    await android.unmount();
  }

  mocks.os.current = "ios";
  mocks.variables.length = 0;
  const ios = await render(({ TableChip }) => <TableChip playerId={player} name="Ada" />);

  try {
    expect(mocks.variables).toContain(`--color-chip-${tableChipOf(player)}`);
    expect(ios.host.querySelectorAll("[data-mark]").length).toBe(8);
    expect(ios.initial()).toBe("A");
  } finally {
    await ios.unmount();
  }
});
