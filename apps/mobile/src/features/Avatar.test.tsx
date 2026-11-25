import { avatarToneOf } from "@stacks/client-runtime/avatar";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const variables: string[] = [];

  return { variables, fail: { current: () => {} } };
});

type Styled = { style?: object; children?: ReactNode };

vi.mock("react-native", () => ({
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
    Defs: ({ children }: Styled) => <defs>{children}</defs>,
    LinearGradient: ({ children }: Styled) => <g data-gradient>{children}</g>,
    Stop: Mark,
    Rect: Mark,
  };
});

vi.mock("lucide-react-native/icons/user", () => ({ default: () => <i data-silhouette /> }));

vi.mock("../components/ui/Text", () => ({
  Text: ({ children }: Styled) => <span data-initials>{children}</span>,
}));

vi.mock("uniwind", () => ({
  useCSSVariable: (names: string[]) => {
    mocks.variables.push(...names);

    return names.map(() => "#999999");
  },
}));

const render = async (element: ReactNode) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(element));

  return {
    host,
    image: () => host.querySelector("img"),
    initials: () => host.querySelector("[data-initials]")?.textContent ?? null,
    silhouette: () => host.querySelector("[data-silhouette]"),
    unmount: () => act(async () => root.unmount()),
  };
};

afterEach(() => {
  mocks.variables.length = 0;
  mocks.fail.current = () => {};

  vi.unstubAllGlobals();
});

it("draws the photo when there is one", async () => {
  const { Avatar } = await import("./Avatar");

  const view = await render(<Avatar name="Ada" playerId="p1" image="file:///photos/ada.jpg" />);

  try {
    expect(view.image()?.getAttribute("src")).toBe("file:///photos/ada.jpg");
    expect(view.initials()).toBeNull();
  } finally {
    await view.unmount();
  }
});

it("falls back to the default avatar when a photo won't load", async () => {
  const { Avatar } = await import("./Avatar");

  const view = await render(<Avatar name="Ada" playerId="p1" image="file:///photos/gone.jpg" />);

  try {
    expect(view.image()).not.toBeNull();
    await act(async () => mocks.fail.current());
    expect(view.image()).toBeNull();
    expect(view.initials()).not.toBeNull();
  } finally {
    await view.unmount();
  }
});

it("draws the default avatar with no photo", async () => {
  const { Avatar } = await import("./Avatar");
  const view = await render(<Avatar name="Ada" playerId="p1" image={null} />);

  try {
    expect(view.image()).toBeNull();
    expect(view.initials()).not.toBeNull();
  } finally {
    await view.unmount();
  }
});

it("draws iOS's grey monogram with up to two initials", async () => {
  const { AvatarFace } = await import("./AvatarFace.ios");
  const view = await render(<AvatarFace name="Ada Lovelace" playerId="p1" size={32} />);

  try {
    expect(view.initials()).toBe("AL");
    expect(view.host.querySelector("[data-gradient]")).not.toBeNull();
    expect(mocks.variables).toEqual([
      "--color-avatar-top",
      "--color-avatar-bottom",
      "--color-avatar-ink",
    ]);
  } finally {
    await view.unmount();
  }
});

it("draws Android's letter tile with one initial, in the tone the player's ID picks", async () => {
  const { AvatarFace } = await import("./AvatarFace.android");
  const view = await render(<AvatarFace name="Ada Lovelace" playerId="p1" size={36} />);
  const tone = avatarToneOf("p1");

  try {
    expect(view.initials()).toBe("A");
    expect(mocks.variables).toEqual([`--color-avatar-${tone}`, `--color-avatar-${tone}-ink`]);
  } finally {
    await view.unmount();
  }
});

it("draws a silhouette for a name with no letters", async () => {
  const ios = await import("./AvatarFace.ios");
  const android = await import("./AvatarFace.android");

  for (const { AvatarFace } of [ios, android]) {
    const view = await render(<AvatarFace name="🎰" playerId="p1" size={32} />);

    try {
      expect(view.initials()).toBeNull();
      expect(view.silhouette()).not.toBeNull();
    } finally {
      await view.unmount();
    }
  }
});
